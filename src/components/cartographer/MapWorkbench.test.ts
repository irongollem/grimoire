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

const siteWithPicture: MapStackSource = {
  map_url: "https://example.test/picture.webp",
  grid_calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0 },
  map_layer_url: null,
  map_layer_calibration: null,
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
