import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteMapLayersPanel from "./SiteMapLayersPanel.vue";
import type { PublishStaleness } from "@/lib/locations/siteReadiness";
import type { Location } from "@/types/location.types";

const mocks = vi.hoisted(() => ({
  updateLocation: vi.fn().mockResolvedValue(undefined),
  updatePicture: vi.fn().mockResolvedValue(undefined),
  updateCalibration: vi.fn().mockResolvedValue(undefined),
  upload: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useUpdateLocation: () => ({ mutateAsync: mocks.updateLocation, isPending: ref(false) }),
  useUpdateLocationPicture: () => ({ mutateAsync: mocks.updatePicture }),
  useUpdateLocationGridCalibration: () => ({ mutateAsync: mocks.updateCalibration }),
}));
vi.mock("@/composables/useImageUpload", () => ({
  useImageUpload: () => ({ isUploading: ref(false), upload: mocks.upload, remove: mocks.remove }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

type SiteMapLayersLocation = Pick<
  Location,
  | "id"
  | "name"
  | "map_url"
  | "grid_calibration"
  | "map_layer_url"
  | "map_layer_calibration"
  | "plan_size"
  | "source_map_id"
  | "map_published_rev"
>;

function site(overrides: Partial<SiteMapLayersLocation> = {}): SiteMapLayersLocation {
  return {
    id: "site-1",
    name: "Ashmouth Undercroft",
    map_url: null,
    grid_calibration: null,
    map_layer_url: null,
    map_layer_calibration: null,
    plan_size: null,
    source_map_id: null,
    map_published_rev: null,
    ...overrides,
  };
}

const stubs = { GridCalibrationDialog: true, RouterLink: true };

function mountPanel(props: Partial<InstanceType<typeof SiteMapLayersPanel>["$props"]> = {}) {
  return mount(SiteMapLayersPanel, {
    props: {
      location: site(),
      map: null,
      staleness: null,
      counts: { spaces: 0, ways: 0, zones: 0 },
      ...props,
    },
    global: { stubs },
  });
}

function findButton(wrapper: ReturnType<typeof mountPanel>, label: string) {
  const button = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);
  if (!button) throw new Error(`no AppButton labelled "${label}"`);
  return button;
}

describe("SiteMapLayersPanel", () => {
  beforeEach(() => {
    mocks.updateLocation.mockClear();
    mocks.updatePicture.mockClear();
    mocks.updateCalibration.mockClear();
    mocks.upload.mockClear();
    mocks.remove.mockClear();
    mocks.confirm.mockClear();
    mocks.confirm.mockResolvedValue(true);
  });

  describe("Picture row", () => {
    it("invites an upload when empty", () => {
      const wrapper = mountPanel();
      expect(wrapper.text()).toContain("Picture");
      expect(wrapper.text()).toContain("(empty)");
      expect(() => findButton(wrapper, "Upload a picture")).not.toThrow();
    });

    it("reports the calibration, not the file name, once populated", () => {
      const wrapper = mountPanel({
        location: site({
          map_url: "https://cdn.example/location-images/u1/scan.webp",
          grid_calibration: { cells_per_image_width: 42, origin_x_pct: 0, origin_y_pct: 0 },
        }),
      });
      // An upload is stored under a generated id, so a file name here would
      // print a uuid at the DM. The grid is the actionable fact.
      expect(wrapper.text()).not.toContain("scan.webp");
      expect(wrapper.text()).toContain("Calibrated 42 cells wide");
      expect(() => findButton(wrapper, "Replace")).not.toThrow();
      expect(() => findButton(wrapper, "Re-calibrate")).not.toThrow();
      expect(() => findButton(wrapper, "Remove")).not.toThrow();
    });

    it("says not calibrated when there is no grid_calibration yet", () => {
      const wrapper = mountPanel({ location: site({ map_url: "https://cdn.example/x.webp" }) });
      expect(wrapper.text()).toContain("Not calibrated");
      expect(() => findButton(wrapper, "Calibrate")).not.toThrow();
    });

    it("clears map_url AND grid_calibration on Remove, after confirming", async () => {
      const wrapper = mountPanel({
        location: site({
          map_url: "https://cdn.example/location-images/u1/scan.webp",
          grid_calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 },
        }),
      });
      await findButton(wrapper, "Remove").trigger("click");
      await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
      await vi.waitFor(() =>
        expect(mocks.updateLocation).toHaveBeenCalledWith({
          id: "site-1",
          update: { map_url: null, grid_calibration: null },
        }),
      );
      expect(mocks.remove).toHaveBeenCalledWith("https://cdn.example/location-images/u1/scan.webp");
    });

    it("does nothing on Remove when the confirm is declined", async () => {
      mocks.confirm.mockResolvedValue(false);
      const wrapper = mountPanel({ location: site({ map_url: "https://cdn.example/x.webp" }) });
      await findButton(wrapper, "Remove").trigger("click");
      await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
      expect(mocks.updateLocation).not.toHaveBeenCalled();
    });
  });

  describe("Drawing row", () => {
    it("invites drawing when empty, and emits open-drawing", async () => {
      const wrapper = mountPanel();
      expect(wrapper.text()).toContain("Drawing");
      await findButton(wrapper, "Start drawing").trigger("click");
      expect(wrapper.emitted("open-drawing")).toHaveLength(1);
    });

    it("shows the drawing's name and rev when fresh, with only Open", () => {
      const wrapper = mountPanel({
        location: site({ source_map_id: "map-1", map_published_rev: 14 }),
        map: { name: "Undercroft of Ashmouth", rev: 14 },
        staleness: null,
      });
      expect(wrapper.text()).toContain('"Undercroft of Ashmouth"');
      expect(wrapper.text()).toContain("rev 14");
      expect(() => findButton(wrapper, "Open")).not.toThrow();
      expect(wrapper.text()).not.toContain("Review");
    });

    it("offers Review N changes when stale, alongside Open", () => {
      const staleness: PublishStaleness = {
        behind: 3,
        delta: { changedSpaces: 0, newSpaces: 1, goneSpaces: 0, newWays: 2, goneWays: 0 },
      };
      const wrapper = mountPanel({
        location: site({ id: "site-1", source_map_id: "map-1", map_published_rev: 12 }),
        map: { name: "Undercroft of Ashmouth", rev: 14 },
        staleness,
      });
      expect(wrapper.text()).toContain("plan at rev 12");
      const review = findButton(wrapper, "Review 3 changes");
      expect(review.props("to")).toBe("/cartographer/map-1?publishTo=site-1");
    });

    it("emits open-drawing from an existing drawing's Open too", async () => {
      const wrapper = mountPanel({ location: site({ source_map_id: "map-1" }), map: { name: "X", rev: 1 } });
      await findButton(wrapper, "Open").trigger("click");
      expect(wrapper.emitted("open-drawing")).toHaveLength(1);
    });
  });

  describe("Plan row", () => {
    it("offers a blank grid only when no canvas exists at all", () => {
      const wrapper = mountPanel();
      expect(wrapper.text()).toContain("empty, and no grid above");
      expect(() => findButton(wrapper, "Start a blank grid")).not.toThrow();
    });

    it("writes plan_size from the two number fields", async () => {
      const wrapper = mountPanel();
      const inputs = wrapper.findAllComponents({ name: "AppInput" });
      await inputs[0]!.vm.$emit("update:modelValue", 8);
      await inputs[1]!.vm.$emit("update:modelValue", 6);
      await findButton(wrapper, "Start a blank grid").trigger("click");
      expect(mocks.updateLocation).toHaveBeenCalledWith({
        id: "site-1",
        update: { plan_size: { cols: 8, rows: 6 } },
      });
    });

    it("reports traced counts, with no action, once there is any canvas", () => {
      const wrapper = mountPanel({
        location: site({ map_url: "https://cdn.example/x.webp" }),
        counts: { spaces: 7, ways: 8, zones: 4 },
      });
      expect(wrapper.text()).toContain("7 spaces");
      expect(wrapper.text()).toContain("8 ways out");
      expect(wrapper.text()).toContain("4 zones");
      expect(wrapper.text()).not.toContain("Start a blank grid");
    });

    it("counts a blank grid itself as a canvas — no more invitation once one exists", () => {
      const wrapper = mountPanel({ location: site({ plan_size: { cols: 10, rows: 10 } }) });
      expect(wrapper.text()).not.toContain("Start a blank grid");
      expect(wrapper.text()).toContain("0 spaces");
    });
  });
});
