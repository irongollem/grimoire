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
vi.mock("@/composables/player/useReadItems", () => ({
  useReadItems: () => ({ isUnread: () => false, markRead: vi.fn() }),
}));
const monsters = vi.hoisted(() => ({ byId: new Map<string, unknown>() }));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: { value: monsters.byId } }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { value: [] } }) }));

const CAMPAIGN_ID = "c1";

/** A party member of the given ruleset and species, at full HP. */
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

/** Mounts the row with its heavier panels stubbed. */
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

// A form assumed on the player sheet copied the library row's bare
// `image_url`, which is null for a beast whose picture lives in the art
// tables, so a druid shaped as a Dire Wolf showed the placeholder here
// (5 Oct 2026). The tracker now draws the beast's picture as it reads now.
describe("PartyTrackerRow wild-shaped portrait", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCampaignStore().activeCampaignId = CAMPAIGN_ID;
    monsters.byId.clear();
  });

  /** Creates a Dire Wolf form fixture with a saved portrait URL, or null to test missing art. */
  function shaped(beast_image_url: string | null): PartyMember {
    return {
      ...member("2014", "sp-2014"),
      wildshape_state: {
        monster_id: "srd_dire-wolf", beast_name: "Dire Wolf", beast_image_url,
        beast_hp: 37, beast_max_hp: 37, beast_ac: "14",
      },
    } as PartyMember;
  }

  it("draws the beast's art even when the form copied no picture", () => {
    monsters.byId.set("srd_dire-wolf", { id: "srd_dire-wolf", image_url: "https://cdn.test/dire-wolf.webp", stat_block: {} });
    const wrapper = mountRow(shaped(null), "Firbolg");
    expect(wrapper.findComponent({ name: "FocalImage" }).attributes("src")).toBe("https://cdn.test/dire-wolf.webp");
  });

  it("falls back to the form's own copy until the beast resolves", () => {
    const wrapper = mountRow(shaped("https://cdn.test/copied.webp"), "Firbolg");
    expect(wrapper.findComponent({ name: "FocalImage" }).attributes("src")).toBe("https://cdn.test/copied.webp");
  });
});

describe("PartyTrackerRow critical-hit choice", () => {
  /** A character at 0 HP with this many failed death saves. */
  const atZero = (failures: number) =>
    ({ ...member("2024", "s"), current_hp: 0, death_save_successes: 0, death_save_failures: failures }) as PartyMember;

  it("offers it while the character is dying", () => {
    expect(mountRow(atZero(1), null).text()).toContain("Critical hit");
  });

  it("drops it once the character is dead, where damage has nothing left to do", () => {
    expect(mountRow(atZero(3), null).text()).not.toContain("Critical hit");
  });
});
