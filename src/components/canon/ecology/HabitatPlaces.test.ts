import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";

const mocks = vi.hoisted(() => ({ addPlace: vi.fn(), removePlace: vi.fn() }));
const state = vi.hoisted(() => ({
  places: [] as { id: string; habitatId: string; locationId: string }[],
}));

vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useHabitatEditing: () => ({
    habitats: computed(() => [{ id: "h1", name: "Salt marsh" }, { id: "h2", name: "High moor" }]),
    places: computed(() => state.places),
    addPlace: mocks.addPlace,
    removePlace: mocks.removePlace,
  }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({
    locationOptions: computed(() => [
      { id: "l1", name: "The Marsh", depth: 0 },
      { id: "l2", name: "Saltmere", depth: 1 },
      { id: "l3", name: "The Moor", depth: 0 },
    ]),
  }),
}));

import HabitatPlaces from "./HabitatPlaces.vue";

const habitat = { id: "h1", name: "Salt marsh", description: null, sortOrder: 0, otherPercent: null };
const mountIt = () => mount(HabitatPlaces, { props: { habitat } });
const optionsOf = (picker: { props: () => unknown }) => (picker.props() as { options: { name: string }[] }).options;

describe("HabitatPlaces", () => {
  beforeEach(() => {
    mocks.addPlace.mockReset();
    mocks.removePlace.mockReset();
    state.places = [{ id: "p1", habitatId: "h1", locationId: "l1" }, { id: "p2", habitatId: "h2", locationId: "l3" }];
  });

  // Bug: a place already in another habitat was offered, and adding it hit the table's one-habitat-per-place rule.
  it("does not offer a place already in this habitat or in another, and says which habitat holds the other", () => {
    const w = mountIt();
    expect(optionsOf(w.findComponent(EntityCombobox)).map((o) => o.name)).toEqual(["Saltmere"]);
    expect(w.get("[data-testid=habitat-places-elsewhere]").text()).toBe("Already in another habitat: The Moor (High moor).");
  });

  // Bug: the chips listed every habitat's places.
  it("shows as chips only the places this habitat covers", () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=habitat-place-chip]").map((c) => c.text())).toEqual(["The Marsh"]);
  });

  it("adds the picked place to this habitat and empties the picker", async () => {
    const w = mountIt();
    w.findComponent(EntityCombobox).vm.$emit("update:modelValue", "l2");
    await flushPromises();
    expect(mocks.addPlace).toHaveBeenCalledExactlyOnceWith("h1", "l2");
  });

  it("removes the place whose chip button was pressed", async () => {
    const w = mountIt();
    await w.find("button[aria-label='Stop covering The Marsh']").trigger("click");
    expect(mocks.removePlace).toHaveBeenCalledExactlyOnceWith("p1");
  });
});
