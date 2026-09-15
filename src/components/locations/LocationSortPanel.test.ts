import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationSortPanel from "./LocationSortPanel.vue";
import type { Location } from "@/types/location.types";

function place(overrides: Partial<Location> = {}): Location {
  return {
    id: "site-1",
    name: "Ashmouth Undercroft",
    location_type: "dungeon",
    parent_id: null,
    ...overrides,
  } as Location;
}

function room(id: string, name: string): Location {
  return { id, name, location_type: "room", parent_id: "site-1" } as Location;
}

const locationRef = ref<Location | undefined>(place());
const childrenRef = ref<Location[]>([]);
const npcsRef = ref<{ id: string; name: string; location_id: string | null }[]>([]);
const encountersRef = ref<{ id: string; name: string; is_finished: boolean; location_id: string | null }[]>([]);

const mocks = vi.hoisted(() => ({
  updateNpc: vi.fn(),
  updateEncounter: vi.fn(),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useLocation: () => ({ data: locationRef }),
  useLocations: () => ({ data: childrenRef }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcsByLocations: () => ({ data: npcsRef }),
  useUpdateNpc: () => ({ mutate: mocks.updateNpc }),
}));
vi.mock("@/composables/encounters/useEncounters", () => ({
  useEncountersByLocations: () => ({ data: encountersRef }),
  useUpdateEncounter: () => ({ mutate: mocks.updateEncounter }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));

const stubs = { RouterLink: { template: "<a><slot /></a>" }, EntityCombobox: true };

function mountPanel(building = false) {
  return mount(LocationSortPanel, { props: { locationId: "site-1", building }, global: { stubs } });
}

describe("LocationSortPanel — the #879 re-homing backlog", () => {
  beforeEach(() => {
    locationRef.value = place();
    childrenRef.value = [];
    npcsRef.value = [];
    encountersRef.value = [];
    mocks.updateNpc.mockClear();
    mocks.updateEncounter.mockClear();
  });

  it("renders nothing when the place has no children — nothing to sort into", () => {
    const wrapper = mountPanel(true);
    expect(wrapper.find("h2").exists()).toBe(false);
  });

  it("renders nothing when the place has children but nothing is homed there", () => {
    childrenRef.value = [room("room-a", "Nave of Ash")];
    const wrapper = mountPanel(true);
    expect(wrapper.text()).toContain("Sort Into Rooms");
    expect(wrapper.text()).toContain("Nothing homed here or in its rooms yet.");
  });

  it("marks a resident still on the parent as needing a room, and one already on a child as sorted", () => {
    childrenRef.value = [room("room-a", "Nave of Ash")];
    npcsRef.value = [
      { id: "npc-1", name: "Unsorted Priest", location_id: "site-1" },
      { id: "npc-2", name: "Sorted Acolyte", location_id: "room-a" },
    ];
    const wrapper = mountPanel(true);

    expect(wrapper.text()).toContain("1 of 2 still on Ashmouth Undercroft, waiting for a room.");
    expect(wrapper.text()).toContain("Needs a room");
    // Only one row earns the badge — the sorted one does not.
    expect(wrapper.findAll(".text-ink-caution")).toHaveLength(1);
  });

  it("lists an encounter from a child room and marks it Done when finished", () => {
    childrenRef.value = [room("room-a", "Nave of Ash")];
    encountersRef.value = [{ id: "enc-1", name: "Ambush", is_finished: true, location_id: "room-a" }];
    const wrapper = mountPanel(true);

    expect(wrapper.text()).toContain("Ambush");
    expect(wrapper.text()).toContain("Done");
    expect(wrapper.text()).toContain("Everyone has a room.");
  });

  it("Browse: shows the current room as text, no picker", () => {
    childrenRef.value = [room("room-a", "Nave of Ash")];
    npcsRef.value = [{ id: "npc-1", name: "Priest", location_id: "room-a" }];
    const wrapper = mountPanel(false);

    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);
    expect(wrapper.text()).toContain("Nave of Ash");
  });

  it("Build: commits the move immediately when the picker changes, for both kinds", () => {
    childrenRef.value = [room("room-a", "Nave of Ash")];
    npcsRef.value = [{ id: "npc-1", name: "Priest", location_id: "site-1" }];
    encountersRef.value = [{ id: "enc-1", name: "Ambush", is_finished: false, location_id: "site-1" }];
    const wrapper = mountPanel(true);

    const pickers = wrapper.findAllComponents({ name: "EntityCombobox" });
    expect(pickers).toHaveLength(2);
    pickers[0]!.vm.$emit("update:modelValue", "room-a");
    pickers[1]!.vm.$emit("update:modelValue", "room-a");

    expect(mocks.updateNpc).toHaveBeenCalledWith(
      { id: "npc-1", update: { location_id: "room-a" } },
      expect.anything(),
    );
    expect(mocks.updateEncounter).toHaveBeenCalledWith(
      { id: "enc-1", update: { location_id: "room-a" } },
      expect.anything(),
    );
  });

  it("ignores a clear (empty id) from the picker — no unset affordance exists here", () => {
    childrenRef.value = [room("room-a", "Nave of Ash")];
    npcsRef.value = [{ id: "npc-1", name: "Priest", location_id: "room-a" }];
    const wrapper = mountPanel(true);

    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "");
    expect(mocks.updateNpc).not.toHaveBeenCalled();
  });
});
