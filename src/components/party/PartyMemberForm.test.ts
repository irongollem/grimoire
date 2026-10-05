import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyMemberForm from "./PartyMemberForm.vue";
import type { CharacterClass } from "@/types/multiclass.types";
import type { PartyMember } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";

const rows = ref<CharacterClass[]>([]);
const update = vi.fn();

vi.mock("@/composables/party/useCharacterClasses", () => ({ useCharacterClasses: () => ({ data: rows }) }));
vi.mock("@/composables/rules/useCustomClasses", () => ({
  useCampaignSystemClasses: () => ({ data: ref([]) }),
  useCampaignCustomClasses: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/rules/useSpecies", () => ({
  useCampaignSpecies: () => ({ data: ref([]), all: ref([]) }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useUpdatePartyMember: () => ({ mutateAsync: update }),
  useDeletePartyMember: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/party/useCharacterPool", () => ({ useDetachCharacter: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/party/useArmorClass", () => ({
  useArmorClass: () => ({ acBreakdownFor: () => ({ total: 10, parts: [{ label: "Base", value: 10 }], notes: [] }) }),
}));vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({ data: ref([]) }),
  useUpdateCampaignMember: () => ({ mutateAsync: vi.fn() }),
}));

function row(name: string, levels: number, primary: boolean): CharacterClass {
  return {
    id: name, party_member_id: "m1", class_name: name, class_definition_id: `def-${name}`,
    class_definition_kind: "system", subclass_name: null, subclass_definition_id: null, levels,
    is_primary: primary, hit_dice_used: 0, sort_order: primary ? 0 : 1, created_at: "", updated_at: "",
  };
}

function member(ruleset: RulesetKey): PartyMember {
  return {
    id: "m1", name: "Mira", ruleset, campaign_id: null, class: "Paladin", subclass: null, level: 2,
    skill_proficiencies: {}, saving_throw_proficiencies: [], tool_proficiencies: [], languages: [],
    spell_slots: [],
  } as unknown as PartyMember;
}

function mountForm(m: PartyMember) {
  return mount(PartyMemberForm, {
    props: { member: m },
    global: {
      plugins: [createPinia()],
      stubs: {
        PartyMemberIdentityTab: true,
        PartyMemberProficienciesTab: true,
        PartyMemberPersonaTab: true,
        TabBar: { template: "<div />" },
        AppButton: true,
        PartyMemberAbilitiesTab: { name: "PartyMemberAbilitiesTab", props: ["spellSlotMaxes"], template: "<div />" },
      },
    },
  });
}

async function slotsAfterReset(m: PartyMember): Promise<number[]> {
  const wrapper = mountForm(m);
  (wrapper.vm as unknown as { activeTab: string }).activeTab = "stats";
  await wrapper.vm.$nextTick();
  const tab = wrapper.findComponent({ name: "PartyMemberAbilitiesTab" });
  tab.vm.$emit("reset-slots");
  await wrapper.vm.$nextTick();
  return tab.props("spellSlotMaxes");
}

describe("PartyMemberForm default spell slots", () => {
  beforeEach(() => { rows.value = []; update.mockReset(); });

  // Paladin 1 / Cleric 1: the 2024 multiclass rules round the half-caster up, so
  // the combined caster level is 2 (three first-level slots); 2014 rounds it down.
  it("derive from the character's own edition", async () => {
    rows.value = [row("Paladin", 1, true), row("Cleric", 1, false)];
    expect((await slotsAfterReset(member("2024")))[0]).toBe(3);
    expect((await slotsAfterReset(member("2014")))[0]).toBe(2);
  });

  it("give a classless character none", async () => {
    const slots = await slotsAfterReset({ ...member("2024"), class: null });
    expect(slots.every((v) => v === 0)).toBe(true);
  });
});

describe("PartyMemberForm save (#946)", () => {
  beforeEach(() => { rows.value = []; update.mockReset(); });

  it("sends only the fields the user touched, not ones the server moved meanwhile", async () => {
    const base = { ...member("2024"), name: "Mira", current_hp: 20, max_hp: 20, proficiency_bonus: 2 } as PartyMember;
    const wrapper = mountForm(base);
    const vm = wrapper.vm as unknown as { form: { name: string }; save: () => Promise<void> };
    vm.form.name = "Mira the Bold";
    // A live session spent HP elsewhere after this form opened.
    await wrapper.setProps({ member: { ...base, current_hp: 7 } });
    await vm.save();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].update).toEqual({ name: "Mira the Bold" });
  });

  it("skips the request when nothing changed", async () => {
    const base = { ...member("2024"), name: "Mira", proficiency_bonus: 2 } as PartyMember;
    const wrapper = mountForm(base);
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save();
    expect(update).not.toHaveBeenCalled();
  });
});
