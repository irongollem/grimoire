import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import CompanionForm from "./CompanionForm.vue";
import type { Companion } from "@/types/companion.types";

const create = vi.fn();
const update = vi.fn();

vi.mock("@/composables/encounters/useCompanions", () => ({
  useCreateCompanion: () => ({ mutateAsync: create }),
  useUpdateCompanion: () => ({ mutateAsync: update }),
}));
vi.mock("@/composables/monsters/useMonsters", () => ({ fetchResolvedMonster: vi.fn() }));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({ useMonsterIndex: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: { value: new Map() } }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: { value: [] } }),
  useSharedNpcs: () => ({ data: { value: [] } }),
}));
vi.mock("@/composables/useImageUpload", () => ({ useImageUpload: () => ({ isUploading: false, upload: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

beforeEach(() => {
  setActivePinia(createPinia());
  create.mockReset().mockResolvedValue({});
  update.mockReset().mockResolvedValue({});
});

const stubs = {
  FocalImage: true, FocalPointPicker: true, DmNoteBox: true, EntityCombobox: true,
  StatBlockDefenseFields: true, StatBlockEntrySection: true, DiceExprInput: true, BannerLoader: true,
};

function mountForm(companion?: Companion) {
  return mount(CompanionForm, {
    props: { companion, partyMembers: [], lockedOwnerId: "pm-1" },
    global: { stubs },
  });
}

async function pickType(wrapper: ReturnType<typeof mountForm>, type: string) {
  const select = wrapper.findAll("select").find((s) => s.find(`option[value="${type}"]`).exists());
  await select?.setValue(type);
}

const hasStatus = (w: ReturnType<typeof mountForm>) => w.text().includes("With the party");

// #1115: the database refuses a ready pet, and nobody drives a pet.
describe("CompanionForm pets", () => {
  it("hides Status for a pet and writes it not combat-ready", async () => {
    const wrapper = mountForm();
    await wrapper.find('input[placeholder^="Companion name"]').setValue("Biscuit");
    expect(hasStatus(wrapper)).toBe(true); // positive control: an ally has the control
    await pickType(wrapper, "pet");
    expect(hasStatus(wrapper)).toBe(false);

    await wrapper.findAll("button").find((b) => b.text() === "Add Companion")?.trigger("click");
    await flushPromises();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ companion_type: "pet", combat_ready: false }));
  });

  it("benches a ready companion when it is switched to a pet", async () => {
    const familiar = {
      id: "c1", name: "Wisp", companion_type: "familiar", combat_ready: true, source_type: "custom",
      source_monster_id: null, source_npc_id: null, owner_party_member_id: "pm-1", max_hp: 1, current_hp: 1,
      ac: 10, speed: 30, conditions: [], sort_order: 0, portrait_url: null, stat_block: null,
    } as unknown as Companion;
    const wrapper = mountForm(familiar);
    await pickType(wrapper, "pet");
    await wrapper.findAll("button").find((b) => b.text() === "Save")?.trigger("click");
    await flushPromises();
    expect(update).toHaveBeenCalledWith({
      id: "c1",
      update: expect.objectContaining({ companion_type: "pet", combat_ready: false }),
    });
  });
});
