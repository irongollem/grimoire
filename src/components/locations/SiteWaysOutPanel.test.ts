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
    source_edge_key: null,
    dungeon_feature_id: null,
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
  useDungeonFeatures: () => ({ data: ref([]) }),
  useDungeonFeature: () => ({ data: ref(null), isLoading: ref(false) }),
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
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("2");
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
      const wrapper = mountPanel();

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
      const wrapper = mountPanel();
      const comboboxes = wrapper.findAllComponents({ name: "EntityCombobox" });
      await comboboxes[0]!.vm.$emit("update:modelValue", "nave");
      await comboboxes[1]!.vm.$emit("update:modelValue", "nave");

      expect(findButton(wrapper, "Add").props("disabled")).toBe(true);
    });
  });
});
