import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";

const mocks = vi.hoisted(() => ({ addPlace: vi.fn(), removePlace: vi.fn() }));
const state = vi.hoisted(() => ({ places: [] as { id: string; peopleId: string; locationId: string }[] }));

vi.mock("@/composables/canon/useCampaignPeoples", () => ({
  usePeoplesEditing: () => ({ places: computed(() => state.places), addPlace: mocks.addPlace, removePlace: mocks.removePlace }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({
    locationOptions: computed(() => [
      { id: "l1", name: "Port Vell", depth: 0 },
      { id: "l2", name: "Saltmere", depth: 1 },
    ]),
  }),
}));

import PeoplePlaces from "./PeoplePlaces.vue";

const people = { id: "p1", name: "the Vell", ownName: "the Vell", recordName: "Human", kind: "species", recordId: "srd_human", fromLibrary: true, readable: true, percent: 30, body: null } as const;
const mountIt = () => mount(PeoplePlaces, { props: { people } });
const optionsOf = (picker: { props: () => unknown }) => (picker.props() as { options: { name: string }[] }).options;

describe("PeoplePlaces", () => {
  beforeEach(() => {
    mocks.addPlace.mockReset();
    mocks.removePlace.mockReset();
    state.places = [{ id: "a", peopleId: "p1", locationId: "l1" }, { id: "b", peopleId: "p2", locationId: "l2" }];
  });

  // Bug: another people's place was shown as this one's, or hid the place from this people's picker (a place may hold several peoples).
  it("shows only this people's places and still offers a place another people lives in", () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=people-place-chip]").map((c) => c.text())).toEqual(["Port Vell"]);
    expect(optionsOf(w.findComponent(EntityCombobox)).map((o) => o.name)).toEqual(["Saltmere"]);
  });

  it("adds the picked place to this people and removes the one whose chip was pressed", async () => {
    const w = mountIt();
    w.findComponent(EntityCombobox).vm.$emit("update:modelValue", "l2");
    await flushPromises();
    expect(mocks.addPlace).toHaveBeenCalledExactlyOnceWith("p1", "l2");
    await w.find("button[aria-label='the Vell no longer live in Port Vell']").trigger("click");
    expect(mocks.removePlace).toHaveBeenCalledExactlyOnceWith("a");
  });
});
