import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyTracker from "./PartyTracker.vue";
import type { PartyMember } from "@/types/party.types";

/** Just the fields PartyTracker's own template/sort reads — see the identical
 *  convention in `src/lib/dashboard/deathSaves.test.ts`. */
function partyMember(overrides: Partial<PartyMember> & { id: string }): PartyMember {
  return {
    name: overrides.id,
    sort_order: 0,
    current_initiative: null,
    class: null,
    level: 1,
    species_id: null,
    ...overrides,
  } as PartyMember;
}

const mocks = vi.hoisted(() => ({
  /** Mirrors what `useParty()` (a real TanStack useQuery result) hands back —
   *  undefined data is the disabled/in-flight case this bug was about. */
  partyData: undefined as PartyMember[] | undefined,
  partyIsError: false,
  companions: [] as unknown[],
  classes: [] as unknown[],
  monsters: new Map<string, { name: string }>(),
  npcs: [] as unknown[],
  refetch: vi.fn(),
}));

vi.mock("@/composables/party/useParty", () => ({
  // Real refs, not plain `{ value }` objects: PartyTracker's template reads
  // `party`/`isError` directly, relying on <script setup>'s automatic
  // ref-unwrapping — a non-ref mock renders truthy-object nonsense instead
  // (and fails the `PartyPacks :party="..."` array prop check).
  useParty: () => ({
    data: ref(mocks.partyData),
    isError: ref(mocks.partyIsError),
    refetch: mocks.refetch,
  }),
}));
// The surface reads the active party; here it is the same fixture as useParty.
vi.mock("@/composables/party/useActiveParty", async () => ({
  useActiveParty: (await import("@/composables/party/useParty")).useParty,
}));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/encounters/useCompanions", () => ({
  useCompanions: () => ({ data: { value: mocks.companions } }),
  useDeleteCompanion: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/party/useSpeaker", () => ({ useSpeaker: () => ({ caretakerNameOf: () => null }) }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/notes/usePlayerJournal", () => ({
  useDmAllSharedJournalEntries: () => ({ data: { value: [] } }),
}));
vi.mock("@/composables/rules/useSpecies", () => ({ useAllSpecies: () => ({ data: { value: [] } }), useSpeciesNames: () => () => null }));
vi.mock("@/composables/party/useCharacterClasses", () => ({
  useAllCampaignCharacterClasses: () => ({ data: { value: mocks.classes } }),
}));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: { value: mocks.monsters } }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { value: mocks.npcs } }) }));
vi.mock("@/composables/rules/useOptionalRules", () => ({ useIsRuleEnabled: () => ({ value: false }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));

const globalStubs = {
  RouterLink: true,
  PartyTrackerRow: true,
  PartyXpAward: true,
  CompanionCard: true,
  CompanionForm: true,
  PartyPacks: true,
};

describe("PartyTracker", () => {
  beforeEach(() => {
    mocks.partyData = undefined;
    mocks.partyIsError = false;
    mocks.companions = [];
    mocks.classes = [];
    mocks.monsters = new Map();
    mocks.npcs = [];
    mocks.refetch.mockReset();
  });

  it("shows a loading skeleton, not the empty state, while the query has no answer yet (disabled or in-flight)", () => {
    mocks.partyData = undefined;
    mocks.partyIsError = false;
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(wrapper.text()).not.toContain("No heroes in your party");
    expect(wrapper.text()).not.toContain("could not be loaded");
    expect(wrapper.find("[role=status]").exists()).toBe(true);
  });

  it("shows an error state with a working Retry control when the query fails", async () => {
    mocks.partyData = undefined;
    mocks.partyIsError = true;
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(wrapper.text()).not.toContain("No heroes in your party");
    expect(wrapper.text()).toContain("The party could not be loaded.");
    const retry = wrapper.findAll("button").find((b) => b.text() === "Retry");
    expect(retry).toBeTruthy();
    await retry!.trigger("click");
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state only once the query has actually succeeded with zero rows", () => {
    mocks.partyData = [];
    mocks.partyIsError = false;
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(wrapper.text()).toContain("No heroes in your party");
  });

  it("renders the party cards when the query succeeds with rows", () => {
    mocks.partyData = [partyMember({ id: "member-1", name: "Mira" })];
    mocks.partyIsError = false;
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(wrapper.text()).not.toContain("No heroes in your party");
    expect(wrapper.text()).not.toContain("could not be loaded");
    expect(wrapper.findComponent({ name: "PartyTrackerRow" }).exists()).toBe(true);
  });

  it("lists a companion whose owner left the active roster under the unassigned ones", () => {
    mocks.partyData = [partyMember({ id: "member-1", name: "Mira" })];
    mocks.companions = [
      { id: "c-owned", name: "Pip", owner_party_member_id: "member-1", source_monster_id: null },
      { id: "c-orphan", name: "Fang", owner_party_member_id: "fallen-1", source_monster_id: null },
    ];
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    const cards = wrapper.findAllComponents({ name: "CompanionCard" });
    expect(cards.map((c) => c.props("companion").id)).toEqual(["c-orphan"]);
  });

  const rows = (w: ReturnType<typeof mount>) => w.findAllComponents({ name: "PartyTrackerRow" });
  const order = (w: ReturnType<typeof mount>) => rows(w).map((r) => r.props("member").id);

  it("orders the party by initiative once everyone has rolled, otherwise by table order", () => {
    mocks.partyData = [
      partyMember({ id: "a", sort_order: 0, current_initiative: 8 }),
      partyMember({ id: "b", sort_order: 1, current_initiative: 17 }),
      partyMember({ id: "c", sort_order: 2, current_initiative: 12 }),
    ];
    expect(order(mount(PartyTracker, { global: { stubs: globalStubs } }))).toEqual(["b", "c", "a"]);
    mocks.partyData = [
      partyMember({ id: "a", sort_order: 2, current_initiative: 8 }),
      partyMember({ id: "b", sort_order: 0, current_initiative: 17 }),
      partyMember({ id: "c", sort_order: 1, current_initiative: null }),
    ];
    expect(order(mount(PartyTracker, { global: { stubs: globalStubs } }))).toEqual(["b", "c", "a"]);
  });

  it("a character with no class rows is classless at its own level; one class names it; several are joined with total level", () => {
    mocks.partyData = [
      partyMember({ id: "none", sort_order: 0, level: 4 }),
      partyMember({ id: "one", sort_order: 1, level: 1 }),
      partyMember({ id: "multi", sort_order: 2, level: 1 }),
    ];
    mocks.classes = [
      { party_member_id: "one", class_name: "Wizard", levels: 3, is_primary: true, sort_order: 0 },
      { party_member_id: "multi", class_name: "Fighter", levels: 2, is_primary: true, sort_order: 0 },
      { party_member_id: "multi", class_name: "Rogue", levels: 1, is_primary: false, sort_order: 1 },
    ];
    const w = mount(PartyTracker, { global: { stubs: globalStubs } });
    const info = Object.fromEntries(rows(w).map((r) => [r.props("member").id, [r.props("classLabel"), r.props("levelDisplay")]]));
    expect(info).toEqual({ none: ["", 4], one: ["Wizard", 3], multi: ["Fighter 2 / Rogue 1", 3] });
  });

  it("links a companion to the monster or NPC it was built from, and to nothing otherwise", () => {
    mocks.partyData = [partyMember({ id: "m" })];
    mocks.monsters = new Map([["mon-1", { name: "Wolf" }]]);
    mocks.npcs = [{ id: "npc-1", name: "Old Tom" }];
    mocks.companions = [
      { id: "c1", name: "A", owner_party_member_id: null, source_type: "monster", source_monster_id: "mon-1", source_npc_id: null },
      { id: "c2", name: "B", owner_party_member_id: null, source_type: "npc", source_monster_id: null, source_npc_id: "npc-1" },
      { id: "c3", name: "C", owner_party_member_id: null, source_type: "custom", source_monster_id: null, source_npc_id: null },
    ];
    const cards = mount(PartyTracker, { global: { stubs: globalStubs } }).findAllComponents({ name: "CompanionCard" });
    expect(cards.map((c) => [c.props("sourceName"), c.props("sourceLink")])).toEqual([
      ["Wolf", "/bestiary/mon-1"],
      ["Old Tom", "/npcs/npc-1"],
      ["", ""],
    ]);
  });

  it("gives each character only their own companions", () => {
    mocks.partyData = [partyMember({ id: "m1", sort_order: 0 }), partyMember({ id: "m2", sort_order: 1 })];
    mocks.companions = [
      { id: "c1", name: "A", owner_party_member_id: "m1", source_monster_id: null },
      { id: "c2", name: "B", owner_party_member_id: "m2", source_monster_id: null },
    ];
    const w = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(rows(w).map((r) => (r.props("companions") as { id: string }[]).map((c) => c.id))).toEqual([["c1"], ["c2"]]);
  });
});
