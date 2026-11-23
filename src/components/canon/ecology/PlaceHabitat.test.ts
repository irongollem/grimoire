import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";

const state = vi.hoisted(() => ({
  places: [] as { id: string; habitatId: string; locationId: string }[],
}));

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

  // Bug: a room of a covered town said it lay in the habitat as if covered itself, hiding where it came from.
  it("says which place a room inherits the habitat through", () => {
    state.places = [{ id: "p", habitatId: "h1", locationId: "town" }];
    expect(mountFor("tavern").get("[data-testid=place-habitat]").text()).toContain("Salt marsh, through Saltmere");
  });

  // Bug: a place in no habitat drew an empty block.
  it("renders nothing for a place in no habitat", () => {
    state.places = [{ id: "p", habitatId: "h1", locationId: "town" }];
    expect(mountFor("hill").find("[data-testid=place-habitat]").exists()).toBe(false);
  });
});
