import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyTrackerRow from "./PartyTrackerRow.vue";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import type { PartyMember } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/party/useArmorClass", () => ({ useArmorClass: () => ({ acFor: () => 10, acBreakdownFor: () => ({ total: 10, parts: [{ label: "Base", value: 10 }], notes: [] }) }) }));
vi.mock("@/composables/play/useReadItems", () => ({
  useReadItems: () => ({ isUnread: () => false, markRead: vi.fn() }),
}));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: { value: new Map() } }) }));
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

function mountRow(m: PartyMember, speciesName: string | null) {
  return mount(PartyTrackerRow, {
    props: {
      member: m,
      speciesName,
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

// The parent resolves species for the whole party in one query (useSpeciesNames)
// and hands each row its name; the row only renders it.
describe("PartyTrackerRow species name", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const store = useCampaignStore();
    store.activeCampaignId = CAMPAIGN_ID;
    store.activeCampaign = { id: CAMPAIGN_ID, ruleset: "2014" } as Campaign;
  });

  it("shows the species of a 2024 character seated at a 2014 campaign", () => {
    const wrapper = mountRow(member("2024", "sp-2024"), "Species of 2024");
    expect(wrapper.text()).toContain("Species of 2024 · Wizard · Lv3");
  });

  it("still resolves a species of the campaign's own edition", () => {
    const wrapper = mountRow(member("2014", "sp-2014"), "Species of 2014");
    expect(wrapper.text()).toContain("Species of 2014 · Wizard · Lv3");
  });
});
