import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteWaysOutPanel from "./SiteWaysOutPanel.vue";
import type { SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";

function door(overrides: Partial<SiteDoorWithSpaces> = {}): SiteDoorWithSpaces {
  return {
    id: "d1",
    user_id: "dm-1",
    from_location_id: "nave",
    to_location_id: "cell",
    label: "",
    is_one_way: false,
    door_kind: "door",
    // Placed by default (#884) — most fixtures are testing an ordinary,
    // fully-resolved door; the "unplaced"/"one-sided" tests below override
    // this explicitly rather than every other test needing to.
    edge_key: "0,0:N",
    derived_from: "dm",
    dungeon_feature_id: null,
    library_dungeon_feature_id: null,
    starts_locked: false,
    lock_note: null,
    is_secret: false,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    from_location: { id: "nave", name: "Nave", location_type: "room" },
    to_location: { id: "cell", name: "Abbot's Cell", location_type: "room" },
    ...overrides,
  };
}

const doorsRef = ref<SiteDoorWithSpaces[]>([]);

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/composables/locations/useSiteDoors", () => ({
  useSiteDoors: () => ({ data: doorsRef, isLoading: ref(false) }),
}));
vi.mock("@/composables/locations/useLocationDoors", () => ({
  useCreateLocationDoor: () => ({ mutate: mocks.create, isPending: ref(false) }),
  useUpdateLocationDoor: () => ({ mutate: mocks.update }),
  useDeleteLocationDoor: () => ({ mutate: mocks.remove }),
}));
vi.mock("@/composables/dungeon-features/useDungeonFeatures", () => ({
  useDungeonFeatureIndex: () => ({ data: ref([]) }),
  useDungeonFeature: () => ({ data: ref(null), isLoading: ref(false) }),
  useLibraryDungeonFeature: () => ({ data: ref(null), isLoading: ref(false) }),
}));

const SPACES = [
  { id: "nave", name: "Nave", location_type: "room" as const },
  { id: "cell", name: "Abbot's Cell", location_type: "room" as const },
  { id: "level2", name: "Level 2", location_type: "dungeon" as const },
];

function mountPanel(props: Partial<InstanceType<typeof SiteWaysOutPanel>["$props"]> = {}) {
  return mount(SiteWaysOutPanel, {
    props: { siteId: "site-1", spaces: SPACES, ...props },
  });
}

function findButton(wrapper: ReturnType<typeof mountPanel>, label: string) {
  const button = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
  if (!button) throw new Error(`no AppButton labelled "${label}"`);
  return button;
}

describe("SiteWaysOutPanel", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.remove.mockReset();
    doorsRef.value = [];
  });

  it("titles a horizontal door with the right-arrow join of its two spaces", () => {
    doorsRef.value = [door({ id: "d1", from_location_id: "nave", to_location_id: "cell" })];
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Nave → Abbot's Cell");
  });

  it("titles a vertical door with the down-arrow join, and shows its stair chip", () => {
    doorsRef.value = [
      door({
        id: "d2",
        door_kind: "stair",
        from_location_id: "nave",
        to_location_id: "level2",
        to_location: { id: "level2", name: "Level 2", location_type: "dungeon" },
      }),
    ];
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Nave ↓ Level 2");
    expect(wrapper.text()).toContain("Stair");
  });

  it("shows a secret door's chip and subtitle", () => {
    doorsRef.value = [door({ id: "d1", is_secret: true, label: "behind the ash-screen" })];
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("secret");
    expect(wrapper.text()).toContain("Secret · behind the ash-screen");
  });

  it("counts every door in the header chip", () => {
    doorsRef.value = [
      door({ id: "d1", from_location_id: "nave", to_location_id: "cell" }),
      door({ id: "d2", door_kind: "stair", from_location_id: "nave", to_location_id: "level2" }),
    ];
    expect(mountPanel().get("header").text()).toMatch(/Ways out\s*2$/);
    doorsRef.value = [door({ id: "d1" })];
    expect(mountPanel().get("header").text()).toMatch(/Ways out\s*1$/);
  });

  it("lists the ways out in title order, whatever order they were stored in", () => {
    doorsRef.value = [
      door({ id: "d1", from_location_id: "nave", to_location_id: "cell" }),
      door({ id: "d2", from_location_id: "cell", to_location_id: "nave", from_location: { id: "cell", name: "Abbot's Cell", location_type: "room" }, to_location: { id: "nave", name: "Nave", location_type: "room" } }),
    ];
    const titles = mountPanel().findAll(".font-semibold.truncate").map((t) => t.text());
    expect(titles).toEqual(["Abbot's Cell → Nave", "Nave → Abbot's Cell"]);
  });

  describe("verticalOnly", () => {
    it("keeps only stair/shaft doors and hides the add form", () => {
      doorsRef.value = [
        door({ id: "d1", door_kind: "door", from_location_id: "nave", to_location_id: "cell" }),
        door({
          id: "d2",
          door_kind: "stair",
          from_location_id: "nave",
          to_location_id: "level2",
          to_location: { id: "level2", name: "Level 2", location_type: "dungeon" },
        }),
      ];
      const wrapper = mountPanel({ verticalOnly: true });

      expect(wrapper.text()).toContain("Nave ↓ Level 2");
      expect(wrapper.text()).not.toContain("Nave → Abbot's Cell");
      expect(wrapper.text()).not.toContain("Add");
      expect(wrapper.findAllComponents({ name: "EntityCombobox" })).toHaveLength(0);
    });

    it("renders the frame-06 heading", () => {
      const wrapper = mountPanel({ verticalOnly: true });
      expect(wrapper.text()).toContain("Vertical ways out");
    });
  });

  describe("inline add", () => {
    it("creates a door from the picked spaces, kind, and flags", async () => {
      const wrapper = mountPanel({ building: true });

      const comboboxes = wrapper.findAllComponents({ name: "EntityCombobox" });
      expect(comboboxes).toHaveLength(2); // from, to — no row is expanded to add a third
      await comboboxes[0]!.vm.$emit("update:modelValue", "nave");
      await comboboxes[1]!.vm.$emit("update:modelValue", "level2");

      const kindSelect = wrapper.findComponent({ name: "AppSelect" });
      await kindSelect.vm.$emit("update:modelValue", "stair");

      await findButton(wrapper, "Add").trigger("click");

      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          from_location_id: "nave",
          to_location_id: "level2",
          door_kind: "stair",
          label: "",
          is_one_way: false,
          starts_locked: false,
          is_secret: false,
          lock_note: null,
        }),
        expect.anything(),
      );
    });

    it("does not create a door when from and to are the same space", async () => {
      const wrapper = mountPanel({ building: true });
      const comboboxes = wrapper.findAllComponents({ name: "EntityCombobox" });
      await comboboxes[0]!.vm.$emit("update:modelValue", "nave");
      await comboboxes[1]!.vm.$emit("update:modelValue", "nave");

      expect(findButton(wrapper, "Add").props("disabled")).toBe(true);
    });
  });

  describe("Browse vs Build (#884)", () => {
    it("hides the add form and every edit affordance in Browse", () => {
      doorsRef.value = [door({ id: "d1", starts_locked: true, is_secret: true })];
      const wrapper = mountPanel();

      expect(wrapper.findAllComponents({ name: "EntityCombobox" })).toHaveLength(0);
      expect(wrapper.text()).not.toContain("Add");
      // The three facts still read, as badges rather than toggles.
      expect(wrapper.text()).toContain("secret");
      expect(wrapper.text()).toContain("locked");
    });

    it("shows the add form once building", () => {
      const wrapper = mountPanel({ building: true });
      expect(wrapper.findAllComponents({ name: "EntityCombobox" })).toHaveLength(2);
    });
  });

  describe("unplaced and one-sided doors (#884)", () => {
    it("never offers a 'Place it' action — placing a door is the Plan's own Door tool now (#884 S11)", () => {
      doorsRef.value = [door({ id: "d1", edge_key: null })];
      const wrapper = mountPanel({ building: true });
      expect(wrapper.findAllComponents({ name: "AppButton" }).some((b) => b.props("label") === "Place it")).toBe(false);
      expect(wrapper.text()).toContain("Not placed");
    });

    it("titles a one-sided door with 'leads nowhere yet' instead of the far room's name, and chips it", () => {
      doorsRef.value = [door({ id: "d1", edge_key: "0,0:N", to_location_id: null, to_location: null })];
      const wrapper = mountPanel();
      expect(wrapper.text()).toContain("Nave → leads nowhere yet");
      expect(wrapper.text()).toContain("leads nowhere yet");
    });
  });
});

describe("SiteWaysOutPanel — Build edits", () => {
  const byTooltip = (w: ReturnType<typeof mountPanel>, tooltip: string) =>
    w.findAllComponents({ name: "AppButton" }).find((b) => b.props("tooltip") === tooltip)!;
  const fill = async (w: ReturnType<typeof mountPanel>, from = "nave", to = "cell") => {
    const boxes = w.findAllComponents({ name: "EntityCombobox" });
    await boxes[0]!.vm.$emit("update:modelValue", from);
    await boxes[1]!.vm.$emit("update:modelValue", to);
  };

  beforeEach(() => {
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.remove.mockReset();
    doorsRef.value = [door({ id: "d1", starts_locked: true, lock_note: "brass key", label: "iron grille" })];
  });

  it("offers no expand or remove in Browse, nor on the vertical rail", () => {
    for (const props of [{}, { building: true, verticalOnly: true }]) {
      const w = mountPanel(props);
      expect(w.findAllComponents({ name: "AppButton" }).some((b) => b.props("tooltip") === "Remove this way out"), JSON.stringify(props)).toBe(false);
      expect(w.findAllComponents({ name: "AppButton" }).some((b) => b.props("tooltip") === "Edit this way out"), JSON.stringify(props)).toBe(false);
    }
  });

  it("removes a way out by its id", async () => {
    await byTooltip(mountPanel({ building: true }), "Remove this way out").trigger("click");
    expect(mocks.remove).toHaveBeenCalledWith("d1", expect.anything());
  });

  it("flips the one-way, locked and secret flags from the edit drawer", async () => {
    const w = mountPanel({ building: true });
    await byTooltip(w, "Edit this way out").trigger("click");
    await byTooltip(w, "Passable only from this side").trigger("click");
    await byTooltip(w, "Starts locked: brass key").trigger("click");
    await byTooltip(w, "Secret: hidden until the party finds it").trigger("click");
    expect(mocks.update.mock.calls.map((c) => c[0])).toEqual([
      { id: "d1", update: { is_one_way: true } },
      { id: "d1", update: { starts_locked: false } },
      { id: "d1", update: { is_secret: true } },
    ]);
  });

  it("changes the kind from the drawer", async () => {
    const w = mountPanel({ building: true });
    await byTooltip(w, "Edit this way out").trigger("click");
    await w.findAllComponents({ name: "AppSelect" })[0]!.vm.$emit("update:modelValue", "stair");
    expect(mocks.update).toHaveBeenCalledWith({ id: "d1", update: { door_kind: "stair" } }, expect.anything());
  });

  it("trims a label and the lock note, clears a blank note to null, and ignores an unchanged one", async () => {
    const w = mountPanel({ building: true });
    await byTooltip(w, "Edit this way out").trigger("click");
    const [lockNote, label] = w.findAllComponents({ name: "PlacementNoteInput" });
    label!.vm.$emit("commit", "  portcullis ");
    label!.vm.$emit("commit", "iron grille");
    lockNote!.vm.$emit("commit", "   ");
    lockNote!.vm.$emit("commit", "brass key");
    expect(mocks.update.mock.calls.map((c) => c[0])).toEqual([
      { id: "d1", update: { label: "portcullis" } },
      { id: "d1", update: { lock_note: null } },
    ]);
  });

  it("adds the way out with its label trimmed, the lock note only when locked, then empties the form", async () => {
    mocks.create.mockImplementation((_payload, opts) => opts.onSuccess());
    const w = mountPanel({ building: true });
    await fill(w);
    await w.findComponent({ name: "AppInput" }).vm.$emit("update:modelValue", "  iron grille ");
    const [oneWay, locked] = w.findAllComponents({ name: "AppCheckbox" });
    await oneWay!.vm.$emit("update:modelValue", true);
    await locked!.vm.$emit("update:modelValue", true);
    const inputs = w.findAllComponents({ name: "AppInput" });
    await inputs[1]!.vm.$emit("update:modelValue", " the brass key ");
    await findButton(w, "Add").trigger("click");
    expect(mocks.create).toHaveBeenCalledWith(
      { from_location_id: "nave", to_location_id: "cell", label: "iron grille", is_one_way: true, starts_locked: true, lock_note: "the brass key", is_secret: false, door_kind: "door" },
      expect.anything(),
    );
    const boxes = w.findAllComponents({ name: "EntityCombobox" });
    expect(boxes[0]!.props("modelValue")).toBe("");
    expect(boxes[1]!.props("modelValue")).toBe("");
    expect(w.findAllComponents({ name: "AppCheckbox" })[0]!.props("modelValue")).toBe(false);
  });

  it("drops a lock note that was typed and then unlocked", async () => {
    const w = mountPanel({ building: true });
    await fill(w);
    const locked = w.findAllComponents({ name: "AppCheckbox" })[1]!;
    await locked.vm.$emit("update:modelValue", true);
    await w.findAllComponents({ name: "AppInput" })[1]!.vm.$emit("update:modelValue", "the brass key");
    await locked.vm.$emit("update:modelValue", false);
    await findButton(w, "Add").trigger("click");
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ starts_locked: false, lock_note: null });
  });

  it("keeps the form filled in when the add fails", async () => {
    mocks.create.mockImplementation((_payload, opts) => opts.onError(new Error("guard")));
    const w = mountPanel({ building: true });
    await fill(w);
    await findButton(w, "Add").trigger("click");
    expect(w.findAllComponents({ name: "EntityCombobox" })[0]!.props("modelValue")).toBe("nave");
  });

  it("cannot pick the from space as the to space", async () => {
    const w = mountPanel({ building: true });
    await w.findAllComponents({ name: "EntityCombobox" })[0]!.vm.$emit("update:modelValue", "nave");
    const toOptions = w.findAllComponents({ name: "EntityCombobox" })[1]!.props("options") as { id: string }[];
    expect(toOptions.map((o) => o.id)).not.toContain("nave");
  });
});
