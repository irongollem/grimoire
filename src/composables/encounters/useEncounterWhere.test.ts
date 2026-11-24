import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed } from "vue";

const state = vi.hoisted(() => ({ places: [] as { id: string; habitatId: string; locationId: string }[], percent: 40, tables: [] as { id: string; name: string; placeId: string }[] }));
vi.mock("@/composables/canon/usePlacedTables", () => ({ usePlacedTables: () => computed(() => state.tables) }));
vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useCampaignHabitats: () => ({
    habitats: computed(() => [{ id: "h1", name: "Salt marsh", description: null, sortOrder: 0 }]),
    places: computed(() => state.places),
    life: computed(() => [{ id: "l1", habitatId: "h1", recordId: "eel", fromLibrary: true, name: "Marsh eel", percent: state.percent, readable: true }]),
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

const { useEncounterWhere } = await import("./useEncounterWhere");

describe("useEncounterWhere", () => {
  beforeEach(() => {
    state.tables = [];
    state.percent = 40;
    state.places = [{ id: "p", habitatId: "h1", locationId: "town" }];
  });

  // Bug: the line did not appear, or the generator was never told the habitat to roll from.
  it("says what lives where the place is, through a covered town", () => {
    const where = useEncounterWhere(() => "tavern");
    expect(where.line.value).toBe("Salt marsh: Marsh eel 40%, anything else 60%");
    expect(where.habitat.value).toMatchObject({ name: "Salt marsh" });
  });

  // Bug: a habitat whose creatures are all at 0% drew "anything else 100%" and rolled a constraint from nothing.
  it("reports no habitat when no creature there has a share", () => {
    state.percent = 0;
    const where = useEncounterWhere(() => "town");
    expect(where.habitat.value).toBeNull();
    expect(where.line.value).toBeNull();
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
});
