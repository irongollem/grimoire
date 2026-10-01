import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyTrackerRow from "./PartyTrackerRow.vue";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import type { PartyMember } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";

// The species list depends on the edition in scope, as the real one does: a 2024 list
// holds only the 2024 species. Reading it at campaign scope would miss a 2024 hero.
vi.mock("@/composables/rules/useSpecies", () => ({
  useSpeciesNameMap: () => {
    const { ruleset } = useRuleset();
    return computed(
      () => new Map([[ruleset.value === "2024" ? "sp-2024" : "sp-2014", `Species of ${ruleset.value}`]]),
    );
  },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/party/useShieldAc", () => ({ useShieldAcBonus: () => ({ acFor: () => 10 }) }));
vi.mock("@/composables/play/useReadItems", () => ({
  useReadItems: () => ({ isUnread: () => false, markRead: vi.fn() }),
}));
vi.mock("@/composables/monsters/useMonsters", () => ({ useAllMonsters: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { value: [] } }) }));

const CAMPAIGN_ID = "c1";

function member(ruleset: RulesetKey, speciesId: string): PartyMember {
  return {
    id: "m1",
    name: "Mira",
    ruleset,
    campaign_id: CAMPAIGN_ID,
    species_id: speciesId,
    conditions: [],
    curses: [],
    saving_throw_proficiencies: [],
    skill_proficiencies: {},
    proficiency_bonus: 2,
    wis: 10,
    int: 10,
    current_hp: 10,
    max_hp: 10,
    temp_hp: 0,
    current_location_id: null,
  } as unknown as PartyMember;
}

function mountRow(m: PartyMember) {
  return mount(PartyTrackerRow, {
    props: {
      member: m,
      locationNameMap: new Map(),
      classLabel: "Wizard",
      levelDisplay: 3,
      companions: [],
    },
    global: {
      stubs: {
        PartyConditionsPanel: true,
        PartyDeathSaves: true,
        CompanionCard: true,
        PlayerJournalDmModal: true,
        FocalImage: true,
      },
    },
  });
}

describe("PartyTrackerRow species name", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const store = useCampaignStore();
    store.activeCampaignId = CAMPAIGN_ID;
    store.activeCampaign = { id: CAMPAIGN_ID, ruleset: "2014" } as Campaign;
  });

  it("shows the species of a 2024 character seated at a 2014 campaign", () => {
    const wrapper = mountRow(member("2024", "sp-2024"));
    expect(wrapper.text()).toContain("Species of 2024 · Wizard · Lv3");
  });

  it("still resolves a species of the campaign's own edition", () => {
    const wrapper = mountRow(member("2014", "sp-2014"));
    expect(wrapper.text()).toContain("Species of 2014 · Wizard · Lv3");
  });
});
