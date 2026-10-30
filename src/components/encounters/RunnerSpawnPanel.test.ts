// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import RunnerSpawnPanel from "./RunnerSpawnPanel.vue";
import type { Monster } from "@/types/monster.types";

const mocks = vi.hoisted(() => ({
  store: {
    encounterId: "e1" as string | null,
    factions: [{ id: "enemy", name: "Enemies" }],
    availableMonsters: [] as Monster[],
    availableNpcs: [],
    addMonster: vi.fn(),
    addNpc: vi.fn(),
  },
  load: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/stores/encounterRun", () => ({ useEncounterRunStore: () => mocks.store }));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({
  useMonsterIndex: () => ({ data: ref([{ id: "srd_owlbear", name: "Owlbear" }]) }),
}));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ loadMonstersByIds: mocks.load }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, fromError: (_e: unknown, fallback: string) => fallback }),
}));

const owlbear = { id: "srd_owlbear", name: "Owlbear" } as Monster;
const EntityCombobox = {
  name: "EntityCombobox",
  props: ["modelValue", "options", "placeholder"],
  emits: ["update:modelValue"],
  template: "<div />",
};

async function pickAndAdd() {
  const w = mount(RunnerSpawnPanel, { global: { stubs: { EntityCombobox } } });
  await w.findAllComponents({ name: "EntityCombobox" })[0].vm.$emit("update:modelValue", "srd_owlbear");
  await w.findAll("button").find((b) => b.text() === "+ Add")!.trigger("click");
  return w;
}

beforeEach(() => {
  mocks.store.encounterId = "e1";
  mocks.store.availableMonsters = [];
  mocks.store.addMonster.mockReset();
  mocks.load.mockReset();
  mocks.toastError.mockReset();
});

describe("RunnerSpawnPanel", () => {
  it("still adds the monster when the tools sheet closes before its row has loaded (the spawn was dropped)", async () => {
    let resolve!: (rows: Map<string, Monster>) => void;
    mocks.load.mockReturnValue(new Promise((r) => (resolve = r)));
    const w = await pickAndAdd();
    w.unmount();
    resolve(new Map([["srd_owlbear", owlbear]]));
    await vi.waitFor(() => expect(mocks.store.addMonster).toHaveBeenCalledWith("srd_owlbear", "enemy", 1));
    expect(mocks.store.availableMonsters).toContain(owlbear);
  });

  it("adds nothing when the fight ended while the row was loading", async () => {
    let resolve!: (rows: Map<string, Monster>) => void;
    mocks.load.mockReturnValue(new Promise((r) => (resolve = r)));
    await pickAndAdd();
    mocks.store.encounterId = null;
    resolve(new Map([["srd_owlbear", owlbear]]));
    await new Promise((r) => setTimeout(r));
    expect(mocks.store.addMonster).not.toHaveBeenCalled();
  });

  it("says so when the monster cannot be found, instead of doing nothing", async () => {
    mocks.load.mockResolvedValue(new Map());
    await pickAndAdd();
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.store.addMonster).not.toHaveBeenCalled();
  });
});
