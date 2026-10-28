import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteMapRegionList from "./SiteMapRegionList.vue";
import type { BindableSpace, LocationMapRegion } from "@/types/locationMapRegion.types";
import type { QuestConsequence } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  // #878 S3 — the batched by-location rules query `SiteMapRegionList` reads
  // to decide each bound space's "Rules" badge count.
  roomRules: [] as QuestConsequence[],
  confirm: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  dmEdit: (patch: Record<string, unknown>) => patch,
  useCreateLocationMapRegion: () => ({ mutateAsync: mocks.create }),
  useUpdateLocationMapRegion: () => ({ mutateAsync: mocks.update, mutate: mocks.update }),
  useDeleteLocationMapRegion: () => ({ mutateAsync: mocks.remove }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestConsequencesByLocations: () => ({ data: { get value() { return mocks.roomRules; } } }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => String(e) }) }));

const stubs = {
  RouterLink: { template: "<a><slot /></a>" },
  EntityCombobox: true,
  // A heavy child with its own composables (`SiteMapRoomRules.test.ts` covers
  // its own behaviour); here only its mount and props matter.
  SiteMapRoomRules: true,
};

function space(overrides: Partial<BindableSpace> = {}): BindableSpace {
  return { id: "room-1", name: "The Reliquary", location_type: "room", ...overrides };
}

function region(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "region-1",
    user_id: "dm-1",
    site_location_id: "site-1",
    space_location_id: "room-1",
    cells: [],
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "dm",
    cell_signature: null,
    vertices: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function consequence(overrides: Partial<QuestConsequence> & { id: string }): QuestConsequence {
  return {
    quest_id: "quest-1",
    on_beat_id: null,
    on_edge_id: null,
    on_objective_id: null,
    on_objective_status: null,
    entry_beat_id: null,
    on_quest_settled: false,
    on_location_id: "room-1",
    on_location_fact: "cleared",
    after_days: 0,
    action: "complete",
    target_objective_id: "obj-1",
    target_npc_id: null,
    target_quest_id: null, target_document_id: null,
    on_clock_id: null, target_clock_id: null, target_location_id: null, target_faction_id: null,
    action_payload: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mountList(props: Partial<InstanceType<typeof SiteMapRegionList>["$props"]> = {}) {
  return mount(SiteMapRegionList, {
    props: {
      locationId: "site-1",
      spaces: [space()],
      regions: [region()],
      activeRegionId: null,
      canTrace: true,
      building: true,
      ...props,
    },
    global: { stubs },
  });
}

function findButton(wrapper: ReturnType<typeof mountList>, label: string) {
  return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
}

describe("SiteMapRegionList", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.update.mockReset();
    mocks.remove.mockReset();
    mocks.roomRules = [];
    mocks.confirm.mockReset().mockResolvedValue(true);
    mocks.toastError.mockReset();
    mocks.create.mockResolvedValue({ id: "new-region" });
    mocks.update.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
  });

  describe("the room rules surface (#878 S3)", () => {
    it("never offers the Rules toggle on a zone or an unbound space — only a bound space carries a #869 rule", () => {
      // Unbound: a space with no region bound to it at all (region points
      // elsewhere), so the row falls into the "Add region" branch.
      const wrapper = mountList({ spaces: [space({ id: "room-2", name: "Unbound Room" })], regions: [] });
      expect(findButton(wrapper, "Rules")).toBeUndefined();
      expect(findButton(wrapper, "Add region")).toBeDefined();
    });

    it("shows a bare 'Rules' toggle when the room has none yet, in Build", () => {
      const wrapper = mountList();
      expect(findButton(wrapper, "Rules")).toBeDefined();
    });

    it("counts existing rules in the toggle's own label", () => {
      mocks.roomRules = [consequence({ id: "c-1" }), consequence({ id: "c-2" })];
      const wrapper = mountList();
      expect(findButton(wrapper, "Rules (2)")).toBeDefined();
    });

    it("hides the toggle entirely in Browse — this is a Build-only authoring surface", () => {
      const wrapper = mountList({ building: false });
      expect(findButton(wrapper, "Rules")).toBeUndefined();
      expect(findButton(wrapper, "Rules (0)")).toBeUndefined();
    });

    it("mounts SiteMapRoomRules with this room's own id and filtered rules once toggled open", async () => {
      mocks.roomRules = [
        consequence({ id: "c-1", on_location_id: "room-1" }),
        consequence({ id: "c-2", on_location_id: "some-other-room" }),
      ];
      const wrapper = mountList();
      expect(wrapper.findComponent({ name: "SiteMapRoomRules" }).exists()).toBe(false);

      await findButton(wrapper, "Rules (1)")!.trigger("click");

      const panel = wrapper.findComponent({ name: "SiteMapRoomRules" });
      expect(panel.exists()).toBe(true);
      expect(panel.props("locationId")).toBe("room-1");
      expect((panel.props("rules") as QuestConsequence[]).map((r) => r.id)).toEqual(["c-1"]);
    });

    it("closes the panel on a second click of the same toggle", async () => {
      const wrapper = mountList();
      await findButton(wrapper, "Rules")!.trigger("click");
      expect(wrapper.findComponent({ name: "SiteMapRoomRules" }).exists()).toBe(true);
      await findButton(wrapper, "Rules")!.trigger("click");
      expect(wrapper.findComponent({ name: "SiteMapRoomRules" }).exists()).toBe(false);
    });
  });

  it("still renders the row's own name and provenance alongside the new toggle", () => {
    const wrapper = mountList({ regions: [region({ vertices: [[0, 0], [1, 0], [1, 1]] })] });
    expect(wrapper.text()).toContain("The Reliquary");
  });
});

describe("SiteMapRegionList in Browse: the plan is read, not changed (epic #884)", () => {
  beforeEach(() => {
    mocks.roomRules = [];
  });

  it("offers no tracing, door, rules, bind or add handles", () => {
    const wrapper = mountList({
      building: false,
      spaces: [space(), space({ id: "room-2", name: "Crypt" })],
      regions: [region(), region({ id: "loose", space_location_id: null, label: "Loose shape" })],
    });
    const labels = wrapper.findAllComponents({ name: "AppButton" }).map((b) => b.props("label"));
    for (const handle of ["Trace", "Doors", "Rules", "Unbind", "Add region"]) expect(labels, handle).not.toContain(handle);
    // Delete is icon-only, so it has a tooltip rather than a label: a loose shape cannot be deleted from Browse either.
    const tooltips = wrapper.findAllComponents({ name: "AppButton" }).map((b) => b.props("tooltip"));
    expect(tooltips).not.toContain("Delete this shape");
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("says which space has no shape yet, and names a loose shape without making it editable", () => {
    const wrapper = mountList({
      building: false,
      spaces: [space(), space({ id: "room-2", name: "Crypt" })],
      regions: [region(), region({ id: "loose", space_location_id: null, label: "Loose shape" })],
    });
    expect(wrapper.text()).toContain("Not traced");
    expect(wrapper.text()).toContain("Loose shape");
  });
});

describe("SiteMapRegionList in Build", () => {
  const labelsOf = (w: ReturnType<typeof mountList>) => w.findAllComponents({ name: "AppButton" }).filter((b) => b.props("label") === "Trace");

  beforeEach(() => {
    mocks.roomRules = [];
    mocks.create.mockReset().mockResolvedValue({ id: "new-region" });
    mocks.update.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.confirm.mockReset().mockResolvedValue(true);
    mocks.toastError.mockReset();
  });

  it("starts an untitled shape from the header's Trace and selects it", async () => {
    const wrapper = mountList({ spaces: [], regions: [] });
    await labelsOf(wrapper)[0]!.trigger("click");
    await Promise.resolve();
    expect(mocks.create).toHaveBeenCalledWith({ site_location_id: "site-1" });
    expect(wrapper.emitted("update:activeRegionId")).toEqual([["new-region"]]);
  });

  it("adds a region for a space that has none, bound to it, and selects it", async () => {
    const wrapper = mountList({ spaces: [space({ id: "room-2", name: "Crypt" })], regions: [] });
    await findButton(wrapper, "Add region")!.trigger("click");
    await Promise.resolve();
    expect(mocks.create).toHaveBeenCalledWith({ site_location_id: "site-1", space_location_id: "room-2" });
    expect(wrapper.emitted("update:activeRegionId")).toEqual([["new-region"]]);
  });

  it("tells the DM when a region cannot be created, and selects nothing", async () => {
    mocks.create.mockRejectedValue(new Error("guard said no"));
    const wrapper = mountList({ spaces: [space({ id: "room-2", name: "Crypt" })], regions: [] });
    await findButton(wrapper, "Add region")!.trigger("click");
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.toastError).toHaveBeenCalled();
    expect(wrapper.emitted("update:activeRegionId")).toBeUndefined();
  });

  it("selects a space's shape to trace, and deselects it on a second press; no tracing without a calibrated grid", async () => {
    const wrapper = mountList();
    await labelsOf(wrapper).at(-1)!.trigger("click");
    expect(wrapper.emitted("update:activeRegionId")).toEqual([["region-1"]]);
    await wrapper.setProps({ activeRegionId: "region-1" });
    await labelsOf(wrapper).at(-1)!.trigger("click");
    expect(wrapper.emitted("update:activeRegionId")![1]).toEqual([null]);

    const uncalibrated = mountList({ canTrace: false });
    expect(labelsOf(uncalibrated).at(-1)!.props("disabled")).toBe(true);
  });

  it("unbinds a shape from its space by clearing the binding", async () => {
    const wrapper = mountList();
    await findButton(wrapper, "Unbind")!.trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "region-1", update: { space_location_id: null } });
  });

  it("binds a loose shape to the space picked, offers only unclaimed spaces, and ignores a cleared pick", async () => {
    const wrapper = mountList({
      spaces: [space(), space({ id: "room-2", name: "Crypt" })],
      regions: [region(), region({ id: "loose", space_location_id: null })],
    });
    const picker = wrapper.findComponent({ name: "EntityCombobox" });
    expect((picker.props("options") as BindableSpace[]).map((o) => o.id)).toEqual(["room-2"]);
    picker.vm.$emit("update:modelValue", "");
    expect(mocks.update).not.toHaveBeenCalled();
    picker.vm.$emit("update:modelValue", "room-2");
    expect(mocks.update).toHaveBeenCalledWith({ id: "loose", update: { space_location_id: "room-2" } });
  });

  it("keeps a shape when the DM declines the delete, and deletes it, deselecting it, when they agree", async () => {
    mocks.confirm.mockResolvedValue(false);
    const wrapper = mountList({ activeRegionId: "region-1" });
    const del = () => wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("tooltip") === "Delete this space's shape")!;
    await del().trigger("click");
    await Promise.resolve();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:activeRegionId")).toBeUndefined();

    mocks.confirm.mockResolvedValue(true);
    await del().trigger("click");
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.confirm).toHaveBeenLastCalledWith('Delete "The Reliquary"? This cannot be undone.', { danger: true });
    expect(mocks.remove).toHaveBeenCalledWith("region-1");
    expect(wrapper.emitted("update:activeRegionId")).toEqual([[null]]);
  });

  describe("naming a loose shape", () => {
    const loose = (label: string | null) => region({ id: "loose", space_location_id: null, label });
    const rename = async (wrapper: ReturnType<typeof mountList>, value: string) => {
      wrapper.findComponent({ name: "AppInput" }).vm.$emit("update:modelValue", value);
    };

    it("stores the trimmed name", async () => {
      const wrapper = mountList({ spaces: [], regions: [loose(null)] });
      await rename(wrapper, "  Collapsed stair  ");
      expect(mocks.update).toHaveBeenCalledWith({ id: "loose", update: { label: "Collapsed stair" } });
    });

    it("stores a cleared name as null, and writes nothing when the name did not change", async () => {
      const wrapper = mountList({ spaces: [], regions: [loose("Collapsed stair")] });
      await rename(wrapper, "   ");
      expect(mocks.update).toHaveBeenCalledWith({ id: "loose", update: { label: null } });
      mocks.update.mockClear();
      await rename(wrapper, "Collapsed stair ");
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  it("arms and disarms the door tool", async () => {
    const wrapper = mountList({ doorToolArmed: false });
    await findButton(wrapper, "Doors")!.trigger("click");
    expect(wrapper.emitted("update:doorToolArmed")).toEqual([[true]]);
  });

  it("numbers only the spaces that have a shape, and counts cells, vertices and origin", () => {
    const wrapper = mountList({
      spaces: [space(), space({ id: "room-2", name: "Crypt" })],
      regions: [
        region({ cells: ["0,0", "0,1"] as LocationMapRegion["cells"], vertices: [[0, 0], [1, 0], [1, 1]], derived_from: "floodfill" }),
        region({ id: "loose", space_location_id: null, cells: ["3,3"] as LocationMapRegion["cells"] }),
      ],
    });
    const text = wrapper.text();
    expect(text).toContain("1. The Reliquary");
    expect(text).not.toMatch(/2\. Crypt/);
    expect(text).toContain("2 cells · 3 vertices · from flood fill");
    expect(text).toMatch(/1 cell(?!s)/);
  });

  it("leaves a zone out of the untitled shapes", () => {
    const wrapper = mountList({ spaces: [], regions: [region({ id: "z", space_location_id: null, region_role: "zone", zone_kind: "hazard" })] });
    expect(wrapper.text()).toContain("Nothing traced yet.");
  });
});
