// @vitest-environment jsdom
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import RunnerCombatantCard from "./RunnerCombatantCard.vue";
import type { RunCombatant } from "@/types/encounter.types";

const mocks = vi.hoisted(() => ({
  store: {
    started: false,
    round: 0,
    activeCombatant: null as unknown,
    tiedInstanceIds: new Set<string>(),
  },
  displayHp: undefined as unknown as { value: number },
  wildshape: undefined as unknown as { value: unknown },
  cycleReveal: vi.fn(),
}));

vi.mock("@/stores/encounterRun", () => ({ useEncounterRunStore: () => mocks.store }));
vi.mock("@/composables/encounters/useRunnerCombatant", () => ({
  useRunnerCombatant: () => ({
    wildshape: mocks.wildshape,
    displayHp: mocks.displayHp,
    displayMaxHp: ref(20),
    displayTempHp: ref(0),
    displayAc: ref("14"),
    factionColor: () => "#fff",
    revealTone: () => "neutral",
    revealBtnTitle: () => "Reveal",
    handleCycleReveal: mocks.cycleReveal,
  }),
}));
vi.mock("@/composables/encounters/useRunnerConditions", () => ({
  useRunnerConditions: () => ({
    displayConditions: ref([{ name: "Prone" }, { name: "Poisoned" }, { name: "Stunned" }]),
    pcConcentration: ref(null),
  }),
}));

enableAutoUnmount(afterEach);

const goblin = { instance_id: "m1", type: "monster", name: "Goblin", initiative: 12, hp: 10, max_hp: 20 } as unknown as RunCombatant;
const stubs = {
  RunnerInitiativeField: { template: "<button class='init-field'>init</button>" },
  RunnerRollStatus: true,
  FocalImage: true,
};
const mountRow = (c: RunCombatant = goblin) => mount(RunnerCombatantCard, { props: { combatant: c }, global: { stubs } });

describe("RunnerCombatantCard (phone row)", () => {
  beforeEach(() => {
    mocks.store.started = false;
    mocks.store.round = 0;
    mocks.store.activeCombatant = null;
    mocks.store.tiedInstanceIds = new Set();
    mocks.displayHp = ref(10);
    mocks.wildshape = ref(undefined);
    mocks.cycleReveal.mockReset();
  });

  it("opens the sheet with its own id when the row is tapped", async () => {
    const w = mountRow();
    await w.trigger("click");
    expect(w.emitted("open")).toEqual([["m1"]]);
  });

  // The row is a role="button", and a keyboard user presses Space on a button.
  it("opens the sheet from the keyboard with Space as well as Enter", async () => {
    const w = mountRow();
    await w.trigger("keydown", { key: " " });
    await w.trigger("keydown", { key: "Enter" });
    expect(w.emitted("open")).toEqual([["m1"], ["m1"]]);
  });

  it("editing initiative in the lobby does not open the sheet", async () => {
    const w = mountRow();
    await w.find(".init-field").trigger("click");
    expect(w.emitted("open")).toBeUndefined();
  });

  it("cycling the reveal state does not open the sheet, and only monsters have one", async () => {
    const w = mountRow();
    await w.find(".reveal-btn").trigger("click");
    expect(mocks.cycleReveal).toHaveBeenCalledOnce();
    expect(w.emitted("open")).toBeUndefined();
    expect(mountRow({ ...goblin, type: "player" } as RunCombatant).find(".reveal-btn").exists()).toBe(false);
  });

  it("offers the initiative field only before combat, then a plain number ('—' when unrolled)", () => {
    expect(mountRow().find(".init-field").exists()).toBe(true);
    mocks.store.started = true;
    const started = mountRow();
    expect(started.find(".init-field").exists()).toBe(false);
    expect(started.get("[data-testid=row-init]").text()).toBe("12");
    expect(mountRow({ ...goblin, initiative: null } as RunCombatant).get("[data-testid=row-init]").text()).toBe("—");
  });

  it("marks the combatant whose turn it is", () => {
    mocks.store.started = true;
    mocks.store.activeCombatant = goblin;
    expect(mountRow().attributes("data-active")).toBeDefined();
    mocks.store.activeCombatant = { instance_id: "other" };
    expect(mountRow().attributes("data-active")).toBeUndefined();
  });

  it("flashes the HP change when the HP moves from elsewhere (the sheet, a player's own sheet)", async () => {
    const w = mountRow();
    expect(w.find(".damage-flash").exists()).toBe(false);
    mocks.displayHp.value = 4;
    await w.vm.$nextTick();
    expect(w.get(".damage-flash").text()).toBe("-6");
    expect(w.get(".damage-flash").classes()).toContain("is-damage");
  });

  it("does not flash when a druid wild-shapes and the shown HP swaps to the beast's pool (it flashed -17)", async () => {
    mocks.displayHp = ref(30);
    const w = mountRow({ ...goblin, type: "player" } as RunCombatant);
    mocks.wildshape.value = { beast_name: "Wolf", beast_hp: 13, beast_max_hp: 13 };
    mocks.displayHp.value = 13;
    await w.vm.$nextTick();
    expect(w.find(".damage-flash").exists()).toBe(false);

    mocks.displayHp.value = 8;
    await w.vm.$nextTick();
    expect(w.get(".damage-flash").text()).toBe("-5");
  });

  it("summarises conditions on the second line and dims the used reaction", () => {
    mocks.store.started = true;
    const w = mountRow({ ...goblin, reactionUsed: true } as RunCombatant);
    expect(w.get("[data-testid=row-detail]").text()).toContain("Prone · Poisoned · +1");
    expect(w.find(".mc-reaction").exists()).toBe(true);
  });
});
