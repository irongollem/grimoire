import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyTrackerRow from "./PartyTrackerRow.vue";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const update = vi.hoisted(() => vi.fn());
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: update }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), fromError: (_e: unknown, f: string) => f }) }));
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
function mountRow(m: PartyMember, speciesName: string | null, caretakerName: string | null = null, companions: Companion[] = []) {
  return mount(PartyTrackerRow, {
    props: {
      member: m,
      speciesName,
      locationNameMap: new Map(),
      classLabel: "Wizard",
      levelDisplay: 3,
      companions,
      caretakerName,
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

describe("PartyTrackerRow caretaker chip", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCampaignStore().activeCampaignId = CAMPAIGN_ID;
  });

  it("says who is playing a minded character", () => {
    expect(mountRow(member("2014", "s"), null, "Tomas").text()).toContain("with Tomas");
  });

  it("shows no chip when nobody is minding it", () => {
    expect(mountRow(member("2014", "s"), null).text()).not.toContain("with ");
  });
});

describe("PartyTrackerRow hit point controls", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCampaignStore().activeCampaignId = CAMPAIGN_ID;
    update.mockReset();
    update.mockResolvedValue(undefined);
  });

  const hurt = (over: Partial<PartyMember>) => ({ ...member("2014", "s"), current_hp: 5, max_hp: 10, ...over }) as PartyMember;
  async function press(w: ReturnType<typeof mountRow>, amount: number, label: string) {
    await w.find("input[type=number]").setValue(amount);
    await w.findAll("button").find((b) => b.text() === label)!.trigger("click");
    await flushPromises();
  }

  it("damage spends temporary hit points before real ones", async () => {
    // PHB 2014 "Temporary Hit Points": 3 temp absorbs 3 of the 5, the other 2 come off 10 HP.
    const w = mountRow(hurt({ current_hp: 10, temp_hp: 3 }), null);
    await press(w, 5, "Damage");
    expect(update.mock.calls[0][0]).toMatchObject({ id: "m1", update: { current_hp: 8, temp_hp: 0 } });
  });

  it("clears the amount box after a damage, so the next click does not repeat it", async () => {
    const w = mountRow(hurt({}), null);
    await press(w, 2, "Damage");
    expect((w.find("input[type=number]").element as HTMLInputElement).value).toBe("0");
  });

  it("writes nothing for a zero or negative amount", async () => {
    const w = mountRow(hurt({}), null);
    await press(w, 0, "Damage");
    await press(w, -4, "Heal");
    await press(w, 0, "+Temp");
    expect(update).not.toHaveBeenCalled();
  });

  it("healing never lifts a character above their maximum", async () => {
    const w = mountRow(hurt({ current_hp: 8, max_hp: 10 }), null);
    await press(w, 9, "Heal");
    expect(update.mock.calls[0][0].update.current_hp).toBe(10);
  });

  it("refuses to heal the dead and says so without writing", async () => {
    const dead = hurt({ current_hp: 0, death_save_failures: 3 });
    const w = mountRow(dead, null);
    await press(w, 6, "Heal");
    expect(update).not.toHaveBeenCalled();
  });

  it("temporary hit points do not stack: the larger pool is kept", async () => {
    // PHB 2014 "Temporary Hit Points": new temp HP replace the old only if higher.
    const w = mountRow(hurt({ temp_hp: 5 }), null);
    await press(w, 3, "+Temp");
    expect(update.mock.calls[0][0].update.temp_hp).toBe(5);
    update.mockClear();
    await press(w, 8, "+Temp");
    expect(update.mock.calls[0][0].update.temp_hp).toBe(8);
  });

  it("shows the temporary pool only when there is one", () => {
    expect(mountRow(hurt({ temp_hp: 0 }), null).text()).not.toContain("tmp");
    expect(mountRow(hurt({ temp_hp: 4 }), null).text()).toContain("+4 tmp");
  });

  // app convention (matches the dashboard's party card): red at a quarter or below, amber to half, green above.
  it.each([
    [0, "text-destructive"],
    [1, "text-destructive"],
    [2, "text-destructive"], // 25 of 100 below: see max 8 -> exactly a quarter
    [3, "text-ink-caution"],
    [4, "text-ink-caution"], // exactly half of 8
    [5, "text-ink-success"],
  ])("%i of 8 HP reads %s", (hp, cls) => {
    const w = mountRow(hurt({ current_hp: hp, max_hp: 8 }), null);
    expect(w.find("span.font-bold.text-sm").classes()).toContain(cls);
  });

  it("links a companion to the monster it was built from, and to nothing for a custom one", () => {
    monsters.byId.set("mon-1", { id: "mon-1", name: "Wolf", stat_block: {} });
    const cards = mountRow(member("2014", "s"), null, null, [
      { id: "c1", name: "A", owner_party_member_id: "m1", source_type: "monster", source_monster_id: "mon-1", source_npc_id: null } as Companion,
      { id: "c2", name: "B", owner_party_member_id: "m1", source_type: "custom", source_monster_id: null, source_npc_id: null } as Companion,
    ]).findAllComponents({ name: "CompanionCard" });
    expect(cards.map((c) => [c.props("sourceName"), c.props("sourceLink")])).toEqual([["Wolf", "/bestiary/mon-1"], ["", ""]]);
    monsters.byId.clear();
  });
});
