import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";

const state = vi.hoisted(() => ({ places: [] as { id: string; habitatId: string; locationId: string }[], percent: 40 }));

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

import EncounterWhere from "./EncounterWhere.vue";

const mountFor = (placeId: string | null) => mount(EncounterWhere, { props: { placeId }, global: { stubs: { EntityCombobox: true } } });

describe("EncounterWhere", () => {
  // Bug: the line did not appear, or the panel was never told the habitat to roll from.
  it("shows what lives where the place is and reports the habitat, through a covered town", () => {
    state.places = [{ id: "p", habitatId: "h1", locationId: "town" }];
    const w = mountFor("tavern");
    expect(w.get("[data-testid=encounter-where-life]").text()).toBe("Salt marsh: Marsh eel 40%, anything else 60%");
    expect(w.emitted("habitat")?.[0]?.[0]).toMatchObject({ name: "Salt marsh" });
  });

  // Bug: a habitat whose creatures are all at 0% drew "anything else 100%" and rolled a constraint from nothing.
  it("reports no habitat when no creature there has a share", () => {
    state.places = [{ id: "p", habitatId: "h1", locationId: "town" }];
    state.percent = 0;
    const w = mountFor("town");
    state.percent = 40;
    expect(w.emitted("habitat")?.[0]?.[0]).toBeNull();
    expect(w.find("[data-testid=encounter-where-life]").exists()).toBe(false);
  });

  // Bug: no place, or a place in no habitat, drew a line or reported a habitat to roll.
  it("says nothing and reports no habitat for no place or a place in none", () => {
    state.places = [];
    const w = mountFor("tavern");
    expect(w.find("[data-testid=encounter-where-life]").exists()).toBe(false);
    expect(w.emitted("habitat")?.[0]?.[0]).toBeNull();
    expect(mountFor(null).emitted("habitat")?.[0]?.[0]).toBeNull();
  });
});
