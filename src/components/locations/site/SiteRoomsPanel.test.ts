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
  toastError: vi.fn(),
  confirm: vi.fn(),
  stateOf: vi.fn(),
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
  useLocationStateForRooms: () => ({ stateOf: (id: string, fact: string) => mocks.stateOf(id, fact) }),
}));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/soundboard/useSounds", () => ({
  useSounds: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => e }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

// SortableJS needs a real DOM drag/drop apparatus this environment doesn't
// have; the panel only cares that VueDraggable is *mounted* in Build and
// *not* in Browse, not that it actually reorders. PaywallModal is stubbed
// the same way NpcDetail.test.ts does it — mounting the real component would
// also need useQuota/usePlan/useRouter wired up, when all these tests care
// about is which resource it opens with.
const stubs = { VueDraggable: { name: "VueDraggable", emits: ["end"], template: "<div data-testid='draggable'><slot /></div>" }, PaywallModal: true };

function mountPanel(building = false) {
  return mount(SiteRoomsPanel, { props: { locationId: "site-1", building }, global: { stubs } });
}

describe("SiteRoomsPanel — Browse vs Build (#884)", () => {
  beforeEach(() => {
    roomsRef.value = [];
    allLocationsRef.value = [];
    mocks.create.mockClear();
    mocks.toastError.mockClear();
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

  it("Browse: leaves the site's own ambience row to Build, even when the site is known", () => {
    allLocationsRef.value = [{ id: "site-1", name: "Ashmouth", location_type: "dungeon", parent_id: null, audio_theme: "dungeon-wet" } as Location];
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" })];
    expect(mountPanel(false).findComponent({ name: "RoomAmbienceCell" }).exists()).toBe(false);
    expect(mountPanel(true).findAllComponents({ name: "RoomAmbienceCell" })).toHaveLength(2);
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
    expect(wrapper.text()).toContain("Add the first one below");
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
    const wrapper = mountPanel(true);
    await wrapper.find('input[placeholder="Add a room…"]').setValue("Ossuary");
    await wrapper.find('input[placeholder="Add a room…"]').trigger("keydown.enter");

    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("still toasts a non-quota failure, and leaves the paywall closed", async () => {
    mocks.create.mockImplementation((_payload, opts) => {
      opts.onError({ message: "network error" });
    });
    const wrapper = mountPanel(true);
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
    expect(wrapper.text()).toContain("No grounds yet. Add the first one below.");
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

describe("SiteRoomsPanel — Build edits", () => {
  const nameInput = (w: ReturnType<typeof mountPanel>) => w.get('input[placeholder="Add a room…"]');
  const buttonFor = (w: ReturnType<typeof mountPanel>, tooltip: string) =>
    w.findAllComponents({ name: "AppButton" }).find((b) => b.props("tooltip") === tooltip)!;

  beforeEach(() => {
    roomsRef.value = [room({ id: "room-a", name: "Nave of Ash" }), room({ id: "room-b", name: "Antechamber" })];
    allLocationsRef.value = [];
    for (const m of [mocks.create, mocks.update, mocks.remove, mocks.reorder, mocks.toastError]) m.mockReset();
    mocks.confirm.mockReset().mockResolvedValue(true);
    mocks.stateOf.mockReset().mockReturnValue(undefined);
  });

  it("adds a room under the trimmed name and empties the box once it landed", async () => {
    mocks.create.mockImplementation((_payload, opts) => opts.onSuccess());
    const wrapper = mountPanel(true);
    await nameInput(wrapper).setValue("  Ossuary  ");
    await nameInput(wrapper).trigger("keydown.enter");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Ossuary" }), expect.anything());
    expect((nameInput(wrapper).element as HTMLInputElement).value).toBe("");
  });

  it("keeps what the DM typed when the add fails", async () => {
    mocks.create.mockImplementation((_payload, opts) => opts.onError(new Error("nope")));
    const wrapper = mountPanel(true);
    await nameInput(wrapper).setValue("Ossuary");
    await nameInput(wrapper).trigger("keydown.enter");
    expect((nameInput(wrapper).element as HTMLInputElement).value).toBe("Ossuary");
  });

  it("adds nothing for a blank name", async () => {
    const wrapper = mountPanel(true);
    await nameInput(wrapper).setValue("   ");
    await nameInput(wrapper).trigger("keydown.enter");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("renames a room to the trimmed name on Enter", async () => {
    const wrapper = mountPanel(true);
    await buttonFor(wrapper, "Rename room").trigger("click");
    const input = wrapper.findAllComponents({ name: "AppInput" }).find((i) => i.props("modelValue") === "Nave of Ash")!;
    input.vm.$emit("update:modelValue", "  Nave of Cinders ");
    await input.trigger("keydown.enter");
    expect(mocks.update).toHaveBeenCalledWith({ id: "room-a", update: { name: "Nave of Cinders" } }, expect.anything());
  });

  it("keeps the old name when the rename is blanked, and when Escape is pressed", async () => {
    const wrapper = mountPanel(true);
    await buttonFor(wrapper, "Rename room").trigger("click");
    let input = wrapper.findAllComponents({ name: "AppInput" }).find((i) => i.props("modelValue") === "Nave of Ash")!;
    input.vm.$emit("update:modelValue", "   ");
    await input.trigger("keydown.enter");
    expect(mocks.update).not.toHaveBeenCalled();

    await buttonFor(wrapper, "Rename room").trigger("click");
    input = wrapper.findAllComponents({ name: "AppInput" }).find((i) => i.props("modelValue") === "Nave of Ash")!;
    input.vm.$emit("update:modelValue", "Something else");
    await input.trigger("keydown.escape");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Nave of Ash");
  });

  it("deletes a room only after the DM confirms", async () => {
    mocks.confirm.mockResolvedValueOnce(false);
    const wrapper = mountPanel(true);
    await buttonFor(wrapper, "Delete room").trigger("click");
    await Promise.resolve();
    expect(mocks.remove).not.toHaveBeenCalled();

    await buttonFor(wrapper, "Delete room").trigger("click");
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.confirm.mock.calls[1]![0]).toContain("Nave of Ash");
    expect(mocks.remove).toHaveBeenCalledWith("room-a");
  });

  it("saves the new order when a drag ends", async () => {
    const wrapper = mountPanel(true);
    wrapper.findComponent({ name: "VueDraggable" }).vm.$emit("update:modelValue", [roomsRef.value[1], roomsRef.value[0]]);
    await wrapper.vm.$nextTick();
    wrapper.findComponent({ name: "VueDraggable" }).vm.$emit("end");
    expect(mocks.reorder).toHaveBeenCalledWith(["room-b", "room-a"]);
  });

  it("writes a room's own ambience, and a clear, to that room", async () => {
    const wrapper = mountPanel(true);
    wrapper.findAllComponents({ name: "RoomAmbienceCell" })[0]!.vm.$emit("save", "room-a", "shrine-choral");
    expect(mocks.update).toHaveBeenCalledWith({ id: "room-a", update: { audio_theme: "shrine-choral" } }, expect.anything());
  });

  it("marks only the rooms the party has cleared or looted, in Browse too", () => {
    mocks.stateOf.mockImplementation((id: string, fact: string) => (id === "room-a" && fact === "cleared" ? { value: true } : id === "room-b" && fact === "looted" ? { value: false } : undefined));
    const wrapper = mountPanel(false);
    expect(wrapper.findAll('[title="Cleared"]')).toHaveLength(1);
    expect(wrapper.findAll('[title="Looted"]')).toHaveLength(0);
  });
});
