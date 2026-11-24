import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";

const state = vi.hoisted(() => ({
  places: [] as { id: string; habitatId: string; locationId: string }[],
  tables: [] as { id: string; name: string; placeId: string }[],
}));
vi.mock("@/composables/canon/usePlacedTables", () => ({ usePlacedTables: () => computed(() => state.tables) }));

vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useCampaignHabitats: () => ({
    habitats: computed(() => [{ id: "h1", name: "Salt marsh", description: null, sortOrder: 0 }]),
    places: computed(() => state.places),
    life: computed(() => [
      { id: "l1", habitatId: "h1", recordId: "eel", fromLibrary: true, name: "Marsh eel", percent: 40, readable: true },
      { id: "l2", habitatId: "h1", recordId: "frog", fromLibrary: true, name: "Giant frog", percent: 20, readable: true },
    ]),
  }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({
    data: computed(() => [
      { id: "town", name: "Saltmere", parent_id: null },
      { id: "tavern", name: "The Gull", parent_id: "town" },
      { id: "hill", name: "The Hill", parent_id: null },
    ]),
  }),
}));

import PlaceHabitat from "./PlaceHabitat.vue";

const mountFor = (placeId: string) => mount(PlaceHabitat, { props: { placeId }, global: { stubs: { RouterLink: { props: ["to"], template: "<a :href=\"to.query.section\"><slot /></a>" } } } });

describe("PlaceHabitat", () => {
  beforeEach(() => { state.tables = []; });

  // Bug: the block showed the habitat but not what lives there, or no way to the Life section.
  it("shows the habitat a place is in, what lives there and the way to Life", () => {
    state.places = [{ id: "p", habitatId: "h1", locationId: "town" }];
    const w = mountFor("town");
    expect(w.get("[data-testid=place-habitat]").text()).toContain("Lies in");
    expect(w.get("[data-testid=place-habitat]").text()).toContain("Salt marsh");
    expect(w.get("[data-testid=place-habitat]").text()).not.toContain("through");
    expect(w.get("[data-testid=place-habitat-life]").text()).toBe("Marsh eel 40%, Giant frog 20%, anything else 40%");
    expect(w.get("a").attributes("href")).toBe("life");
  });

  // Bug: a place in no habitat drew an empty block.
  it("renders nothing for a place in no habitat", () => {
    state.places = [{ id: "p", habitatId: "h1", locationId: "town" }];
    expect(mountFor("hill").find("[data-testid=place-habitat]").exists()).toBe(false);
  });
});

describe("PlaceHabitat with a table of its own (#1258 item 15)", () => {
  beforeEach(() => { state.places = [{ id: "p", habitatId: "h1", locationId: "town" }]; });

  // Bug: the page showed the habitat as if it were what the party meets, hiding that the place's own table comes first.
  it("shows the habitat line and says the place's own table comes first", () => {
    state.tables = [{ id: "t1", name: "Coast road encounters", placeId: "town" }];
    const text = mountFor("town").get("[data-testid=place-habitat]").text();
    expect(text).toContain("Salt marsh");
    expect(mountFor("town").get("[data-testid=place-habitat-table]").text()).toBe("Its own table, Coast road encounters, comes first");
    expect(text).toContain("Marsh eel 40%");
  });

  // Bug: the line was drawn for a place whose table belongs to an unrelated place.
  it("says nothing of a table that is on another place", () => {
    state.tables = [{ id: "t1", name: "Hill table", placeId: "hill" }];
    expect(mountFor("town").find("[data-testid=place-habitat-table]").exists()).toBe(false);
  });

  // Bug: a place with a table but in no habitat drew nothing, hiding the table.
  it("still draws the table line for a place in no habitat", () => {
    state.places = [];
    state.tables = [{ id: "t1", name: "Hill table", placeId: "hill" }];
    const w = mountFor("hill");
    expect(w.find("[data-testid=place-habitat-table]").exists()).toBe(true);
    expect(w.find("[data-testid=place-habitat-life]").exists()).toBe(false);
  });
});
