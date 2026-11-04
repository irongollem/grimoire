import { mount, RouterLinkStub } from "@vue/test-utils";
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
  reorder: vi.fn(),
  toastError: vi.fn(),
  stateOf: vi.fn(),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useLocations: () => ({ data: roomsRef }),
  useAllLocations: () => ({ data: allLocationsRef }),
  useCreateLocation: () => ({ mutate: mocks.create, isPending: ref(false) }),
  useUpdateLocation: () => ({ mutate: mocks.update }),
  useReorderLocations: () => ({ mutate: mocks.reorder }),
}));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ stateOf: (id: string, fact: string) => mocks.stateOf(id, fact) }),
}));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/soundboard/useSounds", () => ({
  useSounds: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => e }) }));

// SortableJS needs a real DOM drag/drop apparatus this environment doesn't
// have; the panel only cares that VueDraggable is mounted, not that it
// actually reorders. PaywallModal is stubbed
// the same way NpcDetail.test.ts does it — mounting the real component would
// also need useQuota/usePlan/useRouter wired up, when all these tests care
// about is which resource it opens with.
const stubs = { RouterLink: RouterLinkStub, VueDraggable: { name: "VueDraggable", emits: ["end"], template: "<div data-testid='draggable'><slot /></div>" }, PaywallModal: true };

function mountPanel() {
  return mount(SiteRoomsPanel, { props: { locationId: "site-1" }, global: { stubs } });
}

describe("SiteRoomsPanel — no mode (#1125)", () => {
  beforeEach(() => {
    roomsRef.value = [];
    allLocationsRef.value = [];
    mocks.create.mockClear();
    mocks.toastError.mockClear();
  });

  it("always shows the add row, drag handles and ambience cells", () => {
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" })];
    const wrapper = mountPanel();

    expect(wrapper.find('input[placeholder="Add a room…"]').exists()).toBe(true);
    expect(wrapper.find(".space-drag-handle").exists()).toBe(true);
    expect(wrapper.findComponent({ name: "RoomAmbienceCell" }).exists()).toBe(true);
  });

  it("shows the site's own ambience row once the site is known", () => {
    allLocationsRef.value = [{ id: "site-1", name: "Ashmouth", location_type: "dungeon", parent_id: null, audio_theme: "dungeon-wet" } as Location];
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" })];
    expect(mountPanel().findAllComponents({ name: "RoomAmbienceCell" })).toHaveLength(2);
  });

  it("leaves rename and delete to the room's own Details: the name is a link to it", () => {
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" })];
    const wrapper = mountPanel();

    const tooltips = wrapper.findAllComponents({ name: "AppButton" }).map((b) => b.props("tooltip"));
    expect(tooltips.some((t) => typeof t === "string" && /rename|delete/i.test(t))).toBe(false);
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.text()).toBe("Nave of Ash");
    expect(link.props("to")).toBe("/locations?at=room-a");
  });

  it("the empty state points at the add row, not at a mode", () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Add the first one below");
    expect(wrapper.text()).not.toContain("Build");
  });
});

describe("SiteRoomsPanel — quota rejection opens the paywall, not a raw error (#addSpace)", () => {
  beforeEach(() => {
    roomsRef.value = [];
    allLocationsRef.value = [];
    mocks.create.mockClear();
    mocks.toastError.mockClear();
  });

  it("opens the locations paywall instead of toasting the raw quota_exceeded error", async () => {
    mocks.create.mockImplementation((_payload, opts) => {
      opts.onError({ message: "quota_exceeded" });
    });
    const wrapper = mountPanel();
    await wrapper.find('input[placeholder="Add a room…"]').setValue("Ossuary");
    await wrapper.find('input[placeholder="Add a room…"]').trigger("keydown.enter");

    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("still toasts a non-quota failure, and leaves the paywall closed", async () => {
    mocks.create.mockImplementation((_payload, opts) => {
      opts.onError({ message: "network error" });
    });
    const wrapper = mountPanel();
    await wrapper.find('input[placeholder="Add a room…"]').setValue("Ossuary");
    await wrapper.find('input[placeholder="Add a room…"]').trigger("keydown.enter");

    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
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
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Nave of Ash");
  });

  it("also includes `grounds` children — the #886 interior sibling of `room`", () => {
    roomsRef.value = [room({ id: "grounds-a", name: "Herb Garden", location_type: "grounds" })];
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Herb Garden");
  });

  it("labels the add row and empty state 'room' under a non-wilds site (unchanged default)", () => {
    allLocationsRef.value = [
      { id: "site-1", location_type: "building", parent_id: null } as Location,
    ];
    const wrapper = mountPanel();
    expect(wrapper.find('input[placeholder="Add a room…"]').exists()).toBe(true);
  });

  it("labels the add row and empty state 'grounds' under a `wilds` site", () => {
    allLocationsRef.value = [
      { id: "site-1", location_type: "wilds", parent_id: null } as Location,
    ];
    const wrapper = mountPanel();
    expect(wrapper.find('input[placeholder="Add grounds…"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("No grounds yet. Add the first one below.");
  });

  it("creates `grounds`, not `room`, when adding under a `wilds` site", async () => {
    allLocationsRef.value = [
      { id: "site-1", location_type: "wilds", parent_id: null } as Location,
    ];
    const wrapper = mountPanel();
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
    const wrapper = mountPanel();
    await wrapper.find('input[placeholder="Add a room…"]').setValue("Ossuary");
    await wrapper.find('input[placeholder="Add a room…"]').trigger("keydown.enter");

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ossuary", location_type: "room", parent_id: "site-1" }),
      expect.anything(),
    );
  });
});

describe("SiteRoomsPanel — edits", () => {
  const nameInput = (w: ReturnType<typeof mountPanel>) => w.get('input[placeholder="Add a room…"]');

  beforeEach(() => {
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" }), room({ id: "room-b", name: "Antechamber" })];
    allLocationsRef.value = [];
    for (const m of [mocks.create, mocks.update, mocks.reorder, mocks.toastError]) m.mockReset();
    mocks.stateOf.mockReset().mockReturnValue(undefined);
  });

  it("adds a room under the trimmed name and empties the box once it landed", async () => {
    mocks.create.mockImplementation((_payload, opts) => opts.onSuccess());
    const wrapper = mountPanel();
    await nameInput(wrapper).setValue("  Ossuary  ");
    await nameInput(wrapper).trigger("keydown.enter");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Ossuary" }), expect.anything());
    expect((nameInput(wrapper).element as HTMLInputElement).value).toBe("");
  });

  it("keeps what the DM typed when the add fails", async () => {
    mocks.create.mockImplementation((_payload, opts) => opts.onError(new Error("nope")));
    const wrapper = mountPanel();
    await nameInput(wrapper).setValue("Ossuary");
    await nameInput(wrapper).trigger("keydown.enter");
    expect((nameInput(wrapper).element as HTMLInputElement).value).toBe("Ossuary");
  });

  it("adds nothing for a blank name", async () => {
    const wrapper = mountPanel();
    await nameInput(wrapper).setValue("   ");
    await nameInput(wrapper).trigger("keydown.enter");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves the new order when a drag ends", async () => {
    const wrapper = mountPanel();
    wrapper.findComponent({ name: "VueDraggable" }).vm.$emit("update:modelValue", [roomsRef.value[1], roomsRef.value[0]]);
    await wrapper.vm.$nextTick();
    wrapper.findComponent({ name: "VueDraggable" }).vm.$emit("end");
    expect(mocks.reorder).toHaveBeenCalledWith(["room-b", "room-a"]);
  });

  it("writes a room's own ambience, and a clear, to that room", async () => {
    const wrapper = mountPanel();
    wrapper.findAllComponents({ name: "RoomAmbienceCell" })[0]!.vm.$emit("save", "room-a", "shrine-choral");
    expect(mocks.update).toHaveBeenCalledWith({ id: "room-a", update: { audio_theme: "shrine-choral" } }, expect.anything());
  });

  it("marks only the rooms the party has cleared or looted", () => {
    mocks.stateOf.mockImplementation((id: string, fact: string) => (id === "room-a" && fact === "cleared" ? { value: true } : id === "room-b" && fact === "looted" ? { value: false } : undefined));
    const wrapper = mountPanel();
    expect(wrapper.findAll('[title="Cleared"]')).toHaveLength(1);
    expect(wrapper.findAll('[title="Looted"]')).toHaveLength(0);
  });
});
