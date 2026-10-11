import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MapLayersPanel from "./MapLayersPanel.vue";
import type { PublishStaleness } from "@/lib/locations/siteReadiness";
import type { Location } from "@/types/location.types";

const mocks = vi.hoisted(() => ({
  updateLocation: vi.fn().mockResolvedValue(undefined),
  updatePicture: vi.fn().mockResolvedValue(undefined),
  updateCalibration: vi.fn().mockResolvedValue(undefined),
  upload: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(true),
  party: [] as Array<{ id: string; name: string }>,
  previewData: null as unknown,
  previewLoading: false,
  previewError: null as unknown,
  previewEnabledRef: null as unknown,
  aiEnabled: true,
  toastError: vi.fn(),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ isAiEnabled: mocks.aiEnabled }),
}));

vi.mock("@/composables/locations/useLocations", () => ({
  useUpdateLocation: () => ({ mutateAsync: mocks.updateLocation, isPending: ref(false) }),
  useUpdateLocationPicture: () => ({ mutateAsync: mocks.updatePicture }),
  useUpdateLocationGridCalibration: () => ({ mutateAsync: mocks.updateCalibration }),
}));
vi.mock("@/composables/useImageUpload", () => ({
  useImageUpload: () => ({ isUploading: ref(false), upload: mocks.upload, remove: mocks.remove }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => String(e) }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref(mocks.party) }) }));
vi.mock("@/composables/locations/usePlayerVisibleSiteState", () => ({
  usePlayerVisibleSiteState: (_siteId: unknown, _previewRef: unknown, enabledRef: unknown) => {
    mocks.previewEnabledRef = enabledRef;
    return {
      data: { value: mocks.previewData },
      isLoading: { value: mocks.previewLoading },
      error: { value: mocks.previewError },
    };
  },
}));

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
  | "is_map_shared"
  | "player_visible_to"
  | "is_battle_map"
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
    is_map_shared: false,
    player_visible_to: [],
    is_battle_map: false,
    ...overrides,
  };
}

const stubs = { GridCalibrationDialog: true, RouterLink: true, PlayerSitePlan: true };

function mountPanel(props: Partial<InstanceType<typeof MapLayersPanel>["$props"]> = {}) {
  return mount(MapLayersPanel, {
    props: {
      location: site(),
      site: true,
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

describe("MapLayersPanel", () => {
  beforeEach(() => {
    mocks.updateLocation.mockClear();
    mocks.updatePicture.mockClear();
    mocks.updateCalibration.mockClear();
    mocks.upload.mockClear();
    mocks.remove.mockClear();
    mocks.confirm.mockClear();
    mocks.confirm.mockResolvedValue(true);
    mocks.party = [];
    mocks.previewData = null;
    mocks.previewLoading = false;
    mocks.previewError = null;
    mocks.previewEnabledRef = null;
    mocks.aiEnabled = true;
  });

  describe("Picture row", () => {
    it("says what the layer is for and invites an upload when empty", () => {
      const wrapper = mountPanel();
      expect(wrapper.text()).toContain("Picture");
      expect(wrapper.text()).toContain("A scan or painting of the map, shown underneath");
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

    it("offers Review N changes when stale, alongside Open, and emits review-changes", async () => {
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
      await findButton(wrapper, "Review 3 changes").trigger("click");
      expect(wrapper.emitted("review-changes")).toHaveLength(1);
    });

    it("emits open-drawing from an existing drawing's Open too", async () => {
      const wrapper = mountPanel({ location: site({ source_map_id: "map-1" }), map: { name: "X", rev: 1 } });
      await findButton(wrapper, "Open").trigger("click");
      expect(wrapper.emitted("open-drawing")).toHaveLength(1);
    });

    it("offers Style with AI once there is a drawing, and emits style-with-ai", async () => {
      const wrapper = mountPanel({ location: site({ source_map_id: "map-1" }), map: { name: "X", rev: 1 } });
      await findButton(wrapper, "Style with AI").trigger("click");
      expect(wrapper.emitted("style-with-ai")).toHaveLength(1);
    });

    it("hides Style with AI while the campaign's AI is off", () => {
      mocks.aiEnabled = false;
      const wrapper = mountPanel({ location: site({ source_map_id: "map-1" }), map: { name: "X", rev: 1 } });
      expect(() => findButton(wrapper, "Style with AI")).toThrow();
    });

    it("does not offer Style with AI before there is a drawing to style", () => {
      const wrapper = mountPanel();
      expect(() => findButton(wrapper, "Style with AI")).toThrow();
    });

    it("disables Style with AI, and labels it Styling…, while a render is in flight", () => {
      const wrapper = mountPanel({
        location: site({ source_map_id: "map-1" }),
        map: { name: "X", rev: 1 },
        styling: true,
      });
      const button = findButton(wrapper, "Styling…");
      expect(button.props("disabled")).toBe(true);
    });
  });

  describe("Plan row", () => {
    it("offers a blank grid only when no canvas exists at all", () => {
      const wrapper = mountPanel();
      expect(wrapper.text()).toContain("Needs a map above, or a blank grid");
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

  describe("Preview as players", () => {
    it("stays closed, and queries nothing, until the toggle is clicked", () => {
      mountPanel();
      expect((mocks.previewEnabledRef as { value: boolean } | null)?.value).toBe(false);
    });

    it("says there is nothing to preview when the site isn't shared", async () => {
      const wrapper = mountPanel({ location: site({ is_map_shared: false }) });
      await findButton(wrapper, "Preview as players").trigger("click");
      expect(wrapper.text()).toContain("isn't shared with players yet");
    });

    it("lists only party members this site is shared with", async () => {
      mocks.party = [{ id: "m1", name: "Mira" }, { id: "m2", name: "Hidden" }];
      const wrapper = mountPanel({ location: site({ is_map_shared: true, player_visible_to: ["m1"] }) });
      await findButton(wrapper, "Preview as players").trigger("click");
      expect(wrapper.text()).toContain("Mira");
      expect(wrapper.text()).not.toContain("Hidden");
    });

    it("does not enable the query until an audience is chosen", async () => {
      mocks.party = [{ id: "m1", name: "Mira" }];
      const wrapper = mountPanel({ location: site({ is_map_shared: true, player_visible_to: ["m1"] }) });
      await findButton(wrapper, "Preview as players").trigger("click");
      expect((mocks.previewEnabledRef as { value: boolean }).value).toBe(false);
      const select = wrapper.findComponent({ name: "AppSelect" });
      await select.setValue("m1");
      expect((mocks.previewEnabledRef as { value: boolean }).value).toBe(true);
    });

    it("renders the player-safe plan once it loads", async () => {
      mocks.party = [{ id: "m1", name: "Mira" }];
      mocks.previewData = { spaces: [], glimpsed: [], ways: [], zones: [] };
      const wrapper = mountPanel({ location: site({ is_map_shared: true, player_visible_to: ["m1"] }) });
      await findButton(wrapper, "Preview as players").trigger("click");
      const select = wrapper.findComponent({ name: "AppSelect" });
      await select.setValue("m1");
      expect(wrapper.findComponent({ name: "PlayerSitePlan" }).exists()).toBe(true);
    });
  });
  describe("Battle map flag", () => {
    function checkbox(wrapper: ReturnType<typeof mountPanel>) {
      return wrapper.findComponent({ name: "AppCheckbox" });
    }

    it("sits on the Picture row even with no picture, reflecting the row", () => {
      const wrapper = mountPanel({ location: site({ is_battle_map: true }) });
      expect(checkbox(wrapper).exists()).toBe(true);
      expect(checkbox(wrapper).props("modelValue")).toBe(true);
    });

    it("writes is_battle_map live when ticked", async () => {
      const wrapper = mountPanel();
      await checkbox(wrapper).vm.$emit("update:modelValue", true);
      await flushPromises();
      expect(mocks.updateLocation).toHaveBeenCalledWith({ id: "site-1", update: { is_battle_map: true } });
      expect(checkbox(wrapper).props("modelValue")).toBe(true);
    });

    it("puts the tick back and says so when the write fails", async () => {
      mocks.updateLocation.mockRejectedValueOnce(new Error("nope"));
      const wrapper = mountPanel();
      await checkbox(wrapper).vm.$emit("update:modelValue", true);
      await flushPromises();
      expect(checkbox(wrapper).props("modelValue")).toBe(false);
      expect(mocks.toastError).toHaveBeenCalled();
    });
  });

  describe("on a place that is not a site", () => {
    it("is the Picture row alone: no Drawing, Plan or player preview", () => {
      const wrapper = mountPanel({ site: false, location: site({ map_url: "https://x/m.webp" }) });
      const text = wrapper.text();
      expect(text).toContain("Picture");
      expect(text).not.toContain("Drawing");
      expect(text).not.toContain("Plan");
      expect(text).not.toContain("Preview as players");
      expect(() => findButton(wrapper, "Calibrate")).not.toThrow();
    });

    it("still offers the first upload and the battle-map flag with no map", () => {
      const wrapper = mountPanel({ site: false });
      expect(() => findButton(wrapper, "Upload a picture")).not.toThrow();
      expect(wrapper.findComponent({ name: "AppCheckbox" }).exists()).toBe(true);
    });
  });
});
