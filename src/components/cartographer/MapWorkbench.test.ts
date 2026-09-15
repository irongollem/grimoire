// MapWorkbench (epic #884 S6) — the extracted Cartographer editing surface.
// A focused smoke test: it must mount cleanly both with and without the
// `site` prop, and the reference-layer toggle (the embedded-in-Atlas case)
// must only appear when a site with a Picture layer is actually given —
// with no `site`, the workbench must look and behave exactly like the
// pre-extraction standalone editor.
//
// Mounted in view mode throughout: edit mode additionally mounts
// CartographerInspectorPanel, whose CampaignScopeField reaches for a real
// Pinia store + TanStack Query composable this file has no reason to stand
// up for what is a prop-surface smoke test, not an inspector-panel test.
//
// Every data-fetching composable MapWorkbench itself touches (notes/
// encounters/traps/features/published-sites/tile-packs/campaign store) is
// mocked out — this test is about the prop surface, not about exercising
// Supabase.
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import MapWorkbench from "./MapWorkbench.vue";
import { emptyLayers, type DungeonMap } from "@/types/dungeonMap.types";
import type { MapStackSource } from "@/lib/locations/mapStack";

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: null }),
}));
vi.mock("@/composables/notes/useNotes", () => ({ useNotes: () => ({ data: ref([]) }) }));
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncounters: () => ({ data: ref([]) }) }));
vi.mock("@/composables/dungeon-features/useTraps", () => ({ useTraps: () => ({ data: ref([]) }) }));
vi.mock("@/composables/dungeon-features/useDungeonFeatures", () => ({ useDungeonFeatures: () => ({ data: ref([]) }) }));
vi.mock("@/composables/cartographer/usePublishedSites", () => ({ usePublishedSites: () => ({ data: ref([]) }) }));
vi.mock("@/composables/cartographer/useTilePacks", () => ({
  useTilePacks: () => ({ campaignPacks: ref([]) }),
  loadUserPack: vi.fn(),
}));
vi.mock("@/cartographer/packLoader", () => ({
  loadPack: vi.fn(() => Promise.reject(new Error("no manifest server in tests"))),
}));

// The Plan layer (#884 S7b) — `usePlanPalette` calls these for real
// (TanStack Query/mutation composables), which need a QueryClient this
// prop-surface smoke test never installs. Stubbed the same way every other
// data-fetching composable above already is: this file is about the prop
// surface, not about exercising Supabase.
const { mutationStub } = vi.hoisted(() => ({
  mutationStub: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => ({ id: "stub-id" })), isPending: { value: false } }),
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  useLocationMapRegions: () => ({ data: ref([]) }),
  useCreateLocationMapRegion: mutationStub,
  useUpdateLocationMapRegion: mutationStub,
  useDeleteLocationMapRegion: mutationStub,
  dmEdit: (update: unknown) => ({ ...(update as object), derived_from: "dm" }),
}));
vi.mock("@/composables/locations/useLocationDoors", () => ({
  useCreateLocationDoor: mutationStub,
  useUpdateLocationDoor: mutationStub,
  useDeleteLocationDoor: mutationStub,
}));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocations: () => ({ data: ref([]) }) }));

const baseMap: DungeonMap = {
  id: "map-1",
  user_id: "user-1",
  campaign_id: null,
  name: "Test Dungeon",
  description: null,
  layers: emptyLayers(),
  metadata: {},
  default_pack_id: null,
  tags: [],
  notes: null,
  rev: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const siteWithPicture: MapStackSource & { id: string } = {
  id: "site-1",
  map_url: "https://example.test/picture.webp",
  grid_calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 },
  map_layer_url: null,
  map_layer_calibration: null,
  plan_size: null,
};

// #878 S2 — a site with nothing drawn yet: `hasAnyMapLayer` is false, so
// Build should still open on the Drawing (there is no image to trace over).
const siteWithNoImagery: MapStackSource & { id: string } = {
  id: "site-2",
  map_url: null,
  grid_calibration: null,
  map_layer_url: null,
  map_layer_calibration: null,
  plan_size: null,
};

// A Drawing-only site (no Picture) — `hasAnyMapLayer` must read Drawing too,
// not just Picture, so this is the second half of "any map imagery".
const siteWithDrawing: MapStackSource & { id: string } = {
  id: "site-3",
  map_url: null,
  grid_calibration: null,
  map_layer_url: "https://example.test/drawing.webp",
  map_layer_calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 },
  plan_size: null,
};

describe("MapWorkbench", () => {
  it("mounts without a site prop, and shows no reference-layer toggle", () => {
    const wrapper = mount(MapWorkbench, {
      props: { map: baseMap, viewMode: true },
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Reference");
  });

  it("mounts with a site prop, and shows the reference-layer toggle for its Picture", () => {
    const wrapper = mount(MapWorkbench, {
      props: { map: baseMap, viewMode: true, site: siteWithPicture },
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toContain("Reference");
  });

  // Edit mode additionally mounts CartographerInspectorPanel (CampaignScopeField's
  // real Pinia/TanStack deps, same reason the file's own docblock gives for
  // staying in view mode everywhere else) — stubbed out here since these two
  // tests are only about the toolbox column above it, not the inspector.
  // SiteMapRegionList/SiteMapZoneList (#884 S11, the Plan's own Spaces/Zones
  // panels) are stubbed for the same reason: they reach for `useUiStore`
  // (Pinia) and `useQuests`/`useQuestBeat`/`useQuestBeats` (TanStack Query),
  // neither of which this prop-surface smoke test installs.
  const editModeStubs = {
    global: {
      stubs: {
        CartographerInspectorPanel: true,
        CartographerStructurePanel: true,
        SiteMapRegionList: true,
        SiteMapZoneList: true,
      },
    },
  };

  it("shows no layer selector or Plan palette without a site, even in edit mode", () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
    expect(wrapper.text()).not.toContain("Drawing");
    expect(wrapper.text()).not.toContain("Claim");
  });

  it("shows the layer selector with a site, in edit mode, and can switch layers by hand", async () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false, site: siteWithNoImagery }, ...editModeStubs });
    expect(wrapper.text()).toContain("Drawing");
    expect(wrapper.text()).toContain("Plan");
    // A site with nothing drawn yet opens on the Drawing's own tool palette…
    expect(wrapper.text()).toContain("Floor brush");

    const planButton = wrapper.findAll("button").find((b) => b.text() === "Plan");
    await planButton?.trigger("click");
    // …and switches to the Plan's four tools once selected by hand.
    expect(wrapper.text()).toContain("Claim");
  });

  // #878 S2 — the DM who traced rooms could never find Pen/Shape because
  // Build always opened on the Drawing, even for a site that already had
  // imagery to trace over. These four cover the new initial-default rule.
  describe("initial layer default (#878 S2)", () => {
    it("opens on Drawing without a site at all (the standalone /cartographer route)", () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      expect(wrapper.text()).toContain("Floor brush");
      expect(wrapper.text()).not.toContain("Claim");
    });

    it("opens on Drawing for a site with no map imagery yet", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithNoImagery },
        ...editModeStubs,
      });
      expect(wrapper.text()).toContain("Floor brush");
      expect(wrapper.text()).not.toContain("Claim");
    });

    it("opens on Plan for a site whose imagery is a Picture", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithPicture },
        ...editModeStubs,
      });
      expect(wrapper.text()).toContain("Claim");
      // "Floor brush" alone isn't a safe negative check — the status bar's
      // "Brush: <label>" segment names the Drawing's OWN active tool
      // regardless of which layer is showing. "Eraser" only ever appears in
      // the Drawing tool palette itself.
      expect(wrapper.text()).not.toContain("Eraser");
    });

    it("opens on Plan for a site whose imagery is a Drawing (no Picture)", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithDrawing },
        ...editModeStubs,
      });
      expect(wrapper.text()).toContain("Claim");
      expect(wrapper.text()).not.toContain("Eraser");
    });

    it("keeps the DM's own layer choice — a later prop update does not force it back", async () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithPicture },
        ...editModeStubs,
      });
      // Starts on Plan (site has a Picture)…
      expect(wrapper.text()).toContain("Claim");

      const drawingButton = wrapper.findAll("button").find((b) => b.text() === "Drawing");
      await drawingButton?.trigger("click");
      expect(wrapper.text()).toContain("Floor brush");

      // …a prop change that would re-run any watcher must not force Plan
      // back — the default is read once at setup, never re-applied.
      await wrapper.setProps({ map: { ...baseMap, name: "Renamed" } });
      expect(wrapper.text()).toContain("Floor brush");
      expect(wrapper.text()).not.toContain("Claim");
    });
  });

  it("mounts with a null map (the unsaved-new-map case)", () => {
    const wrapper = mount(MapWorkbench, {
      props: { map: null, viewMode: true },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it("exposes getters the host reads at Save/Cancel time", () => {
    const wrapper = mount(MapWorkbench, {
      props: { map: baseMap, viewMode: true },
    });
    const vm = wrapper.vm as unknown as {
      getName: () => string;
      getLayers: () => unknown;
      isDirty: () => boolean;
    };
    expect(vm.getName()).toBe("Test Dungeon");
    expect(vm.getLayers()).toEqual(emptyLayers());
    expect(vm.isDirty()).toBe(false);
  });
});
