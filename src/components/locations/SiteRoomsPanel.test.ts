import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteRoomsPanel from "./SiteRoomsPanel.vue";
import type { Location } from "@/types/location.types";

function room(overrides: Partial<Location> = {}): Location {
  return {
    id: "room-a",
    name: "The flooded shaft",
    location_type: "room",
    parent_id: "site-1",
    audio_theme: null,
    ...overrides,
  } as Location;
}

const roomsRef = ref<Location[]>([]);
// The site's own record — `useAllLocations` (via `buildAtlasIndex`) is how
// the panel learns its own `location_type` to decide what a new child
// becomes (#886: a `wilds` parent creates `grounds`, everything else creates
// `room`). Empty by default, matching the panel's own "not found → room"
// fallback used by every pre-#886 test below.
const allLocationsRef = ref<Location[]>([]);

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useLocations: () => ({ data: roomsRef }),
  useAllLocations: () => ({ data: allLocationsRef }),
  useCreateLocation: () => ({ mutate: mocks.create, isPending: ref(false) }),
  useUpdateLocation: () => ({ mutate: mocks.update }),
  useDeleteLocation: () => ({ mutate: mocks.remove }),
  useReorderLocations: () => ({ mutate: mocks.reorder }),
}));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ stateOf: () => undefined }),
}));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/soundboard/useSounds", () => ({
  useSounds: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));

// SortableJS needs a real DOM drag/drop apparatus this environment doesn't
// have; the panel only cares that VueDraggable is *mounted* in Build and
// *not* in Browse, not that it actually reorders.
const stubs = { VueDraggable: { template: "<div><slot /></div>" } };

function mountPanel(building = false) {
  return mount(SiteRoomsPanel, { props: { locationId: "site-1", building }, global: { stubs } });
}

describe("SiteRoomsPanel — Browse vs Build (#884)", () => {
  beforeEach(() => {
    roomsRef.value = [];
    allLocationsRef.value = [];
    mocks.create.mockClear();
  });

  it("Browse: renders rooms read-only — no add row, no drag handle, no rename/delete, no ambience control", () => {
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" }), room({ id: "room-b", name: "Antechamber" })];
    const wrapper = mountPanel(false);

    expect(wrapper.text()).toContain("Nave of Ash");
    expect(wrapper.text()).toContain("Antechamber");
    expect(wrapper.find('input[placeholder="Add a room…"]').exists()).toBe(false);
    expect(wrapper.find(".space-drag-handle").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "RoomAmbienceCell" }).exists()).toBe(false);
    expect(wrapper.findAllComponents({ name: "AppButton" })).toHaveLength(0);
  });

  it("Browse: shows the Build pointer, not the add prompt, when there are no rooms yet", () => {
    const wrapper = mountPanel(false);
    expect(wrapper.text()).toContain("Build the site to add them");
    expect(wrapper.text()).not.toContain("add the first one below");
  });

  it("Build: shows the add row, drag handles, and rename/delete controls", () => {
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" })];
    const wrapper = mountPanel(true);

    expect(wrapper.find('input[placeholder="Add a room…"]').exists()).toBe(true);
    expect(wrapper.find(".space-drag-handle").exists()).toBe(true);
    expect(wrapper.findComponent({ name: "RoomAmbienceCell" }).exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: "AppButton" }).length).toBeGreaterThan(0);
  });

  it("Build: the empty state points at adding a room, not at Build itself", () => {
    const wrapper = mountPanel(true);
    expect(wrapper.text()).toContain("add the first one below");
  });
});

describe("SiteRoomsPanel — grounds follow a `wilds` parent (#886)", () => {
  beforeEach(() => {
    roomsRef.value = [];
    allLocationsRef.value = [];
    mocks.create.mockClear();
  });

  it("still includes room children when the site's own type isn't known yet", () => {
    // Regression guard for the isInteriorType rewrite at the useLocations
    // filter (#886): `room` must keep showing up here without depending on
    // the site's own record being loaded.
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" })];
    const wrapper = mountPanel(false);
    expect(wrapper.text()).toContain("Nave of Ash");
  });

  it("also includes `grounds` children — the #886 interior sibling of `room`", () => {
    roomsRef.value = [room({ id: "grounds-a", name: "Herb Garden", location_type: "grounds" })];
    const wrapper = mountPanel(false);
    expect(wrapper.text()).toContain("Herb Garden");
  });

  it("labels the add row and empty state 'room' under a non-wilds site (unchanged default)", () => {
    allLocationsRef.value = [
      { id: "site-1", location_type: "building", parent_id: null } as Location,
    ];
    const wrapper = mountPanel(true);
    expect(wrapper.find('input[placeholder="Add a room…"]').exists()).toBe(true);
  });

  it("labels the add row and empty state 'grounds' under a `wilds` site", () => {
    allLocationsRef.value = [
      { id: "site-1", location_type: "wilds", parent_id: null } as Location,
    ];
    const wrapper = mountPanel(true);
    expect(wrapper.find('input[placeholder="Add grounds…"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("No grounds yet — add the first one below.");
  });

  it("creates `grounds`, not `room`, when adding under a `wilds` site", async () => {
    allLocationsRef.value = [
      { id: "site-1", location_type: "wilds", parent_id: null } as Location,
    ];
    const wrapper = mountPanel(true);
    await wrapper.find('input[placeholder="Add grounds…"]').setValue("Overlook");
    await wrapper.find('input[placeholder="Add grounds…"]').trigger("keydown.enter");

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Overlook", location_type: "grounds", parent_id: "site-1" }),
      expect.anything(),
    );
  });

  it("creates `room` under every other site type", async () => {
    allLocationsRef.value = [
      { id: "site-1", location_type: "dungeon", parent_id: null } as Location,
    ];
    const wrapper = mountPanel(true);
    await wrapper.find('input[placeholder="Add a room…"]').setValue("Ossuary");
    await wrapper.find('input[placeholder="Add a room…"]').trigger("keydown.enter");

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ossuary", location_type: "room", parent_id: "site-1" }),
      expect.anything(),
    );
  });
});
