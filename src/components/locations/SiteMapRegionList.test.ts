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
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => String(e) }) }));

const stubs = {
  RouterLink: { template: "<a><slot /></a>" },
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
    target_quest_id: null,
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
