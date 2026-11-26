import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed } from "vue";

const state = vi.hoisted(() => ({
  ready: true,
  places: [] as { id: string; habitatId: string; locationId: string }[],
  percent: 40 as number | null,
  tables: [] as { id: string; name: string; placeId: string }[],
  season: null as string | null,
  activity: "day" as string | null,
  away: false,
  campaign: true,
}));
vi.mock("@/composables/canon/usePlacedTables", () => ({ usePlacedTablesState: () => ({ tables: computed(() => state.tables), ready: computed(() => state.ready) }) }));
vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useCampaignHabitats: () => ({
    habitats: computed(() => [{ id: "h1", name: "Salt marsh", description: null, sortOrder: 0, otherPercent: 20 }]),
    places: computed(() => state.places),
    habitatSpecies: computed(() => [{ id: "hs1", habitatId: "h1", speciesId: "eel", abundance: "common", sortOrder: 0 }]),
    ready: computed(() => state.ready),
    life: computed(() => [
      { id: "l1", habitatId: "h1", speciesId: "eel", formId: "f1", percent: state.percent, sortOrder: 0, recordId: "eel", fromLibrary: true, name: "Marsh eel", readable: true, speciesName: "Marsh eel", formLabel: "Adult" },
    ]),
  }),
}));
vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useCampaignSpecies: () => ({
    species: computed(() => [{ id: "eel", name: "Marsh eel", scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: state.activity, seasons: state.away ? { winter: { away: true, note: null } } : {}, description: null, sortOrder: 0 }]),
    forms: computed(() => [{ id: "f1", speciesId: "eel", label: "Adult", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: "eel" }]),
    links: computed(() => []),
    statBlockNameByForm: computed(() => new Map([["f1", "Marsh eel"]])),
    ready: computed(() => state.ready),
  }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({
    locationOptions: computed(() => [
      { id: "town", name: "Saltmere", parent_id: null, depth: 0 },
      { id: "tavern", name: "The Gull", parent_id: "town", depth: 1 },
    ]),
  }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get activeCampaign() { return state.campaign ? { current_year: 3, current_month: 1, current_day: 1 } : null; } }),
}));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: {} }) }));
vi.mock("@/lib/calendar/seasons", () => ({ seasonOn: () => (state.season === null ? null : { season: { kind: state.season } }) }));

const { useEncounterWhere } = await import("./useEncounterWhere");

describe("useEncounterWhere", () => {
  beforeEach(() => {
    Object.assign(state, { tables: [], ready: true, percent: 40, places: [{ id: "p", habitatId: "h1", locationId: "town" }], season: null, activity: "day", away: false, campaign: true });
  });

  // Bug: the line did not appear, or the generator was never told the habitat to roll from.
  it("says what lives where the place is, through a covered town", () => {
    const where = useEncounterWhere(() => "tavern");
    expect(where.line.value).toBe("Salt marsh: Marsh eel 40%, anything else 60%");
    expect(where.habitat.value).toMatchObject({ name: "Salt marsh" });
  });

  // Bug: the roll read only the DM's typed shares, so a species left to be worked out was never met.
  it("rolls a share the DM left to be worked out", () => {
    state.percent = null;
    const where = useEncounterWhere(() => "town");
    expect(where.habitat.value?.entries[0].percent).toBe(80);
    expect(where.line.value).toBe("Salt marsh: Marsh eel 80%, anything else 20%");
  });

  // Bug: a habitat whose forms all have no share drew "anything else 100%" and rolled a constraint from nothing.
  it("reports no habitat when no creature there has a share", () => {
    state.percent = 0;
    const where = useEncounterWhere(() => "town");
    expect(where.habitat.value).toBeNull();
    expect(where.line.value).toBeNull();
  });

  // Bug: the card's Time of day never reached the roll, so a night fight met the daytime species at full strength.
  it("halves a species that rests at the chosen hour and says why, and changes nothing at no hour", () => {
    const night = useEncounterWhere(() => "town", () => true, () => "night");
    expect(night.habitat.value?.entries[0].percent).toBe(20);
    expect(night.line.value).toBe("Salt marsh: Marsh eel 20%, anything else 80%. Marsh eel is resting by night, so it is met half as often.");
    expect(useEncounterWhere(() => "town").habitat.value?.entries[0].percent).toBe(40);
  });

  // Bug: the campaign's season was never read, so a species away for the winter was still rolled in winter.
  it("takes a species off the roll in a season it is away, from the campaign's date", () => {
    state.away = true;
    state.season = "winter";
    expect(useEncounterWhere(() => "town").habitat.value).toBeNull();
    state.season = "summer";
    expect(useEncounterWhere(() => "town").habitat.value?.entries[0].percent).toBe(40);
  });

  // Bug: a campaign with no date or no calendar threw instead of rolling with no season.
  it("rolls with no season when there is no campaign date or no season", () => {
    state.away = true;
    state.campaign = false;
    expect(useEncounterWhere(() => "town").habitat.value?.entries[0].percent).toBe(40);
  });

  // Bug: no place, or a place in no habitat, drew a line or reported a habitat to roll.
  it("says nothing for no place or a place in none", () => {
    state.places = [];
    expect(useEncounterWhere(() => "tavern").line.value).toBeNull();
    expect(useEncounterWhere(() => null).habitat.value).toBeNull();
  });

  // Bug: the habitat's shares were still rolled beside the place's own table.
  it("a table on the place or above it wins and nothing is rolled from the habitat", () => {
    state.tables = [{ id: "t1", name: "Coast road encounters", placeId: "town" }];
    const where = useEncounterWhere(() => "tavern");
    expect(where.line.value).toBe("Uses Coast road encounters here");
    expect(where.habitat.value).toBeNull();
  });

  // Bug: any table in the campaign silenced the habitat, not only one on the place or above it.
  it("keeps the habitat when the table is on a place the party is not in", () => {
    state.tables = [{ id: "t1", name: "Elsewhere", placeId: "island" }];
    expect(useEncounterWhere(() => "tavern").habitat.value).toMatchObject({ name: "Salt marsh" });
  });

  // Bug: a caller that asked about a place before the habitat reads had answered rolled with no habitat; `ready` says when to trust the answer.
  it("is ready only once the habitat, species and table reads have answered, and answers per place and hour", () => {
    state.ready = false;
    expect(useEncounterWhere(() => null).ready.value).toBe(false);
    state.ready = true;
    const where = useEncounterWhere(() => null);
    expect(where.ready.value).toBe(true);
    expect(where.habitatFor("tavern")).toMatchObject({ name: "Salt marsh" });
    expect(where.habitatFor("tavern", "night")?.entries[0].percent).toBe(20);
    expect(where.habitatFor("nowhere")).toBeNull();
  });
});
