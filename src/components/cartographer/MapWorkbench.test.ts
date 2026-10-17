// MapWorkbench (epic #884 S6) — the extracted Cartographer editing surface.
// A focused smoke test: it must mount cleanly both with and without the
// `site` prop, and the reference-layer toggle (the embedded-in-Atlas case)
// must only appear when a site with a Picture layer is actually given —
// with no `site`, the workbench must look and behave exactly like the
// pre-extraction standalone editor.
//
// Mounted in view mode throughout where it can be: edit mode additionally mounts the
// bar, whose settings popover holds a CampaignScopeField that reaches for a real
// Pinia store + TanStack Query composable this file has no reason to stand
// up for what is a prop-surface smoke test, not a bar test.
//
// Every data-fetching composable MapWorkbench itself touches (notes/
// encounters/traps/features/published-sites/tile-packs/campaign store) is
// mocked out — this test is about the prop surface, not about exercising
// Supabase.
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils";
import { computed, h, ref, shallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapWorkbench from "./MapWorkbench.vue";
import CartographerBar from "./CartographerBar.vue";
import { emptyLayers, type DungeonMap } from "@/types/dungeonMap.types";
import type { MapStackSource } from "@/lib/locations/mapStack";
import type { LibraryTilePack } from "@/cartographer/userPack.types";
import type { TilePackManifest } from "@/cartographer/packSchema";

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: null }),
}));
vi.mock("@/composables/notes/useNotes", () => ({ useNotes: () => ({ data: ref([]) }) }));
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncounters: () => ({ data: ref([]) }) }));
vi.mock("@/composables/dungeon-features/useTraps", () => ({
  useTraps: () => ({ data: ref([]) }),
  useTrapIndex: () => ({ data: ref([]), byId: ref(new Map()) }),
}));
vi.mock("@/composables/dungeon-features/useDungeonFeatures", () => ({
  useDungeonFeatures: () => ({ data: ref([]) }),
  useDungeonFeatureIndex: () => ({ data: ref([]), byId: ref(new Map()) }),
}));
vi.mock("@/composables/cartographer/useLibraryDressing", () => ({ useDressingCatalog: () => ({ catalog: shallowRef(new Map()) }) }));
vi.mock("@/composables/cartographer/usePublishedSites", () => ({ usePublishedSites: () => ({ data: ref([]) }) }));
vi.mock("@/composables/cartographer/useTilePacks", () => ({
  useTilePacks: () => ({ campaignPacks: ref([]) }),
  loadUserPack: vi.fn(),
}));

// Shared tile packs (#889 S6) — MapWorkbench now reads the library table via
// this composable instead of a hardcoded BUNDLED_PACKS array. `mockLibraryRows`
// is a real ref (mutable by a test even after mount, to simulate a query
// refetch) that every call to the mocked `useLibraryTilePacks()` derives its
// `publishedPacks` from, so a test can arrange the table's contents before
// mounting and/or mutate it mid-test. `vi.mock` factories are hoisted above
// every other module-level statement, so the shared state they close over
// must itself be built inside `vi.hoisted` — a bare top-level `const` here
// would still be in the temporal dead zone when the factory below runs.
const { mockLibraryRows, mockLibraryLoading, mockLoadLibraryPack } = vi.hoisted(() => {
  // eslint-disable-next-line no-restricted-imports -- see note below
  const { ref } = require("vue") as typeof import("vue");
  type LibraryTilePackLike = { pack_id: string; status: string; manifest: { name: string } };
  return {
    mockLibraryRows: ref<LibraryTilePackLike[]>([]),
    mockLibraryLoading: ref(false),
    mockLoadLibraryPack: vi.fn((pack: LibraryTilePackLike) =>
      pack.pack_id === "no-assets"
        ? Promise.reject(new Error("no CDN objects for this pack in tests"))
        : Promise.resolve({
            manifest: pack.manifest,
            validation: { valid: true, missing: [], extras: [], warnings: [] },
            getTile: () => ({ source: new Image(), isPlaceholder: true }),
            variantCount: () => 1,
          }),
    ),
  };
});
vi.mock("@/composables/cartographer/useLibraryTilePacks", () => ({
  useLibraryTilePacks: () => ({
    packs: { isLoading: mockLibraryLoading },
    publishedPacks: computed(() => mockLibraryRows.value.filter((p) => p.status === "published")),
  }),
  loadLibraryPack: mockLoadLibraryPack,
}));

function libraryPack(overrides: Partial<LibraryTilePack> & { pack_id: string; name: string }): LibraryTilePack {
  const manifest: TilePackManifest = {
    pack_id: overrides.pack_id,
    name: overrides.name,
    description: "",
    pack_version: 1,
    schema_version: 1,
    base_tile_size: 128,
    assets: {},
  };
  return {
    id: `row-${overrides.pack_id}`,
    pack_version: 1,
    description: "",
    schema_version: 1,
    manifest,
    status: "published",
    content_source_key: "grimoire-art",
    license_keys: ["cc0"],
    ai_provenance: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockLibraryRows.value = [];
  mockLibraryLoading.value = false;
  mockLoadLibraryPack.mockClear();
});

// Several tests below mount MapWorkbench against a shared, mutable
// `mockLibraryRows` (needed so the "refetch" test can react to a post-mount
// mutation) — every other component ever mounted in this file subscribes to
// that same ref via the mocked `useLibraryTilePacks`, so a wrapper left
// mounted past its own test would still react to a later test's mutation
// and patch against a torn-down tree. Auto-unmounting after every test (not
// just the new ones) is the fix, not a per-test workaround.
enableAutoUnmount(afterEach);

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

/** Whether the rail offers a tool by this name (its buttons carry it as the accessible name). */
function tool(wrapper: ReturnType<typeof mount>, label: string): boolean {
  return wrapper.find(`nav[aria-label="Map tools"] [aria-label="${label}"]`).exists();
}

const baseMap: DungeonMap = {
  id: "map-1",
  user_id: "user-1",
  campaign_id: null,
  name: "Test Dungeon",
  description: null,
  layers: emptyLayers(),
  metadata: {},
  default_pack_id: null,
  darkness: "daylight",
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
  map_layer_stand_url: null,
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
  map_layer_stand_url: null,
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
  map_layer_stand_url: null,
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

  // Edit mode additionally mounts the drawer's panels (real Pinia/TanStack deps, same
  // reason the file's own docblock gives for staying in view mode everywhere else), stubbed
  // out here since these tests are only about the rail and the bar.
  // SiteMapRegionList/SiteMapZoneList (#884 S11, the Plan's own Spaces/Zones
  // panels) are stubbed for the same reason: they reach for a domain UI store
  // (Pinia) and `useQuests`/`useQuestBeat`/`useQuestBeats` (TanStack Query),
  // neither of which this prop-surface smoke test installs.
  const editModeStubs = {
    global: {
      stubs: {
        CartographerStructurePanel: true,
        SiteMapRegionList: true,
        SiteMapZoneList: true,
      },
    },
  };

  it("shows no layer selector or Plan palette without a site, even in edit mode", () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
    expect(wrapper.text()).not.toContain("Drawing");
    expect(tool(wrapper, "Claim")).toBe(false);
  });

  it("offers the Water terrain tool in the Drawing palette", () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
    expect(tool(wrapper, "Water")).toBe(true);
  });

  it("shows the layer selector with a site, in edit mode, and can switch layers by hand", async () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false, site: siteWithNoImagery }, ...editModeStubs });
    expect(wrapper.text()).toContain("Drawing");
    expect(wrapper.text()).toContain("Plan");
    // A site with nothing drawn yet opens on the Drawing's own tool palette…
    expect(tool(wrapper, "Tiles")).toBe(true);

    const planButton = wrapper.findAll("button").find((b) => b.text() === "Plan");
    await planButton?.trigger("click");
    // …and switches to the Plan's four tools once selected by hand.
    expect(tool(wrapper, "Claim")).toBe(true);
  });

  // #878 S2 — the DM who traced rooms could never find Pen/Shape because
  // Build always opened on the Drawing, even for a site that already had
  // imagery to trace over. These four cover the new initial-default rule.
  describe("initial layer default (#878 S2)", () => {
    it("opens on Drawing without a site at all (the standalone /cartographer route)", () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      expect(tool(wrapper, "Tiles")).toBe(true);
      expect(tool(wrapper, "Claim")).toBe(false);
    });

    it("opens on Drawing for a site with no map imagery yet", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithNoImagery },
        ...editModeStubs,
      });
      expect(tool(wrapper, "Tiles")).toBe(true);
      expect(tool(wrapper, "Claim")).toBe(false);
    });

    it("opens on Plan for a site whose imagery is a Picture", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithPicture },
        ...editModeStubs,
      });
      expect(tool(wrapper, "Claim")).toBe(true);
      // "Eraser" only ever appears on the Drawing's own rail; the Plan's is "Erase".
      expect(tool(wrapper, "Eraser")).toBe(false);
    });

    it("opens on Plan for a site whose imagery is a Drawing (no Picture)", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithDrawing },
        ...editModeStubs,
      });
      expect(tool(wrapper, "Claim")).toBe(true);
      expect(tool(wrapper, "Eraser")).toBe(false);
    });

    it("keeps the DM's own layer choice — a later prop update does not force it back", async () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithPicture },
        ...editModeStubs,
      });
      // Starts on Plan (site has a Picture)…
      expect(tool(wrapper, "Claim")).toBe(true);

      const drawingButton = wrapper.findAll("button").find((b) => b.text() === "Drawing");
      await drawingButton?.trigger("click");
      expect(tool(wrapper, "Tiles")).toBe(true);

      // …a prop change that would re-run any watcher must not force Plan
      // back — the default is read once at setup, never re-applied.
      await wrapper.setProps({ map: { ...baseMap, name: "Renamed" } });
      expect(tool(wrapper, "Tiles")).toBe(true);
      expect(tool(wrapper, "Claim")).toBe(false);
    });
  });

  // #889 S6 — the picker used to be a hardcoded BUNDLED_PACKS array; it now
  // reads the `library_tile_packs` table via `useLibraryTilePacks`.
  describe("tile-pack picker reads the library table (#889 S6)", () => {
    it("offers published library packs instead of a hardcoded list, and excludes drafts", async () => {
      mockLibraryRows.value = [
        libraryPack({ pack_id: "sunny-meadow", name: "Sunny Meadow", sort_order: 0 }),
        libraryPack({ pack_id: "unpublished-pack", name: "Draft Pack", status: "draft", sort_order: 1 }),
      ];
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      await flushPromises();

      const bundledPacks = wrapper.findComponent(CartographerBar).props("packs");
      expect(bundledPacks.map((p) => p.pack_id)).toEqual(["sunny-meadow"]);
    });

    it("shows a real empty state when nothing is published, never a fallback constant", async () => {
      mockLibraryRows.value = [];
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: true } });
      await flushPromises();

      expect(wrapper.text()).toContain("No tile packs are published yet");
      const vm = wrapper.vm as unknown as { getCurrentPackId: () => string };
      expect(vm.getCurrentPackId()).toBe("");
    });

    it("defaults to the first published pack the query returns", async () => {
      mockLibraryRows.value = [
        libraryPack({ pack_id: "aaa-first", name: "Aaa First", sort_order: 0 }),
        libraryPack({ pack_id: "zzz-last", name: "Zzz Last", sort_order: 1 }),
      ];
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: true } });
      await flushPromises();

      const vm = wrapper.vm as unknown as { getCurrentPackId: () => string };
      expect(vm.getCurrentPackId()).toBe("aaa-first");
    });

    it("keeps a pack with no loadable assets in the picker (procedural-fallback guarantee)", async () => {
      mockLibraryRows.value = [
        libraryPack({ pack_id: "stone-dungeon", name: "Stone Dungeon", sort_order: 0 }),
        libraryPack({ pack_id: "no-assets", name: "No Assets Yet", sort_order: 1 }),
      ];
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      await flushPromises();

      // Still listed even though its own runtime load rejects below — the
      // picker's contents come from the table, never from load success.
      const bundledPacks = wrapper.findComponent(CartographerBar).props("packs");
      expect(bundledPacks.map((p) => p.pack_id)).toEqual(["stone-dungeon", "no-assets"]);

      const vm = wrapper.vm as unknown as { getRuntimes: () => Map<string, unknown> };
      expect(vm.getRuntimes().has("stone-dungeon")).toBe(true);
      // The one pack whose load rejected never got a runtime entry — but
      // that per-pack failure didn't take the rest of the component down.
      expect(vm.getRuntimes().has("no-assets")).toBe(false);
      expect(wrapper.exists()).toBe(true);
    });

    it("keeps a DM's own pack choice when the library query refetches", async () => {
      mockLibraryRows.value = [
        libraryPack({ pack_id: "stone-dungeon", name: "Stone Dungeon", sort_order: 0 }),
        libraryPack({ pack_id: "icy-cave", name: "Icy Cave", sort_order: 1 }),
      ];
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      await flushPromises();
      const vm = wrapper.vm as unknown as { getCurrentPackId: () => string };
      expect(vm.getCurrentPackId()).toBe("stone-dungeon");

      wrapper.findComponent(CartographerBar).vm.$emit("update:currentPackId", "icy-cave");
      await flushPromises();
      expect(vm.getCurrentPackId()).toBe("icy-cave");

      // Simulate a refetch (e.g. an admin republishing a pack) that reorders
      // the table — this must not force the DM back to whatever is now first.
      mockLibraryRows.value = [
        libraryPack({ pack_id: "icy-cave", name: "Icy Cave", sort_order: 0 }),
        libraryPack({ pack_id: "stone-dungeon", name: "Stone Dungeon", sort_order: 1 }),
      ];
      await flushPromises();
      expect(vm.getCurrentPackId()).toBe("icy-cave");
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
  describe("the slim bar, rail and slip (17 Oct 2026)", () => {
    it("names the tools the new way, in the clusters Look, Floor, Walls, Things, Notes, Eraser", () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      const names = wrapper.findAll('nav[aria-label="Map tools"] button').map((b) => b.attributes("aria-label"));
      expect(names).toEqual([
        "Select", "Pan",
        "Brush", "Tiles", "Rectangle", "Line", "Room", "Fill", "Water", "Rock",
        "Wall", "Door", "Wrap",
        "Object stamp", "Dressing",
        "Label", "Link", "Space",
        "Eraser",
      ]);
      for (const retired of ["Floor brush", "Solid block", "Annotate", "Link entity", "Room template", "Wrap walls"]) {
        expect(names).not.toContain(retired);
      }
    });

    it("titles the options slip with the active tool and follows the rail", async () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      const slip = () => wrapper.find("[data-slip]");
      expect(slip().text()).toContain("Select");
      await wrapper.find('nav[aria-label="Map tools"] [aria-label="Rock"]').trigger("click");
      expect(slip().text()).toContain("Rock");
      expect(slip().text()).toContain("Paint thick, full-cell rock");
    });

    it("opens the Spaces drawer from the bar and closes it from the drawer's own button", async () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      expect(wrapper.find("section[aria-label='Spaces on this map']").exists()).toBe(false);
      const toggle = wrapper.findAll("header button").find((b) => b.text().startsWith("Spaces"));
      await toggle?.trigger("click");
      expect(wrapper.find("section[aria-label='Spaces on this map']").exists()).toBe(true);
      await wrapper.find("[aria-label='Close Spaces on this map']").trigger("click");
      expect(wrapper.find("section[aria-label='Spaces on this map']").exists()).toBe(false);
    });

    it("opens the Dressing drawer with its tool and puts it away with the next one", async () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false },
        global: { stubs: { ...editModeStubs.global.stubs, CartographerDressingPanel: true } },
      });
      await wrapper.find('nav[aria-label="Map tools"] [aria-label="Dressing"]').trigger("click");
      expect(wrapper.find("section[aria-label='Dressing']").exists()).toBe(true);
      await wrapper.find('nav[aria-label="Map tools"] [aria-label="Tiles"]').trigger("click");
      expect(wrapper.find("section[aria-label='Dressing']").exists()).toBe(false);
    });

    it("shows no bar, rail or slip in view mode", () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: true } });
      expect(wrapper.findComponent(CartographerBar).exists()).toBe(false);
      expect(wrapper.find('nav[aria-label="Map tools"]').exists()).toBe(false);
      expect(wrapper.find("[data-slip]").exists()).toBe(false);
    });

    it("hands the host the name and a setter through bar-start, and a rename is an unsaved change", async () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false },
        slots: {
          "bar-start": (slot: { mapName: string; setName: (v: string) => void }) =>
            h("button", { class: "rename", onClick: () => slot.setName(`${slot.mapName}!`) }, slot.mapName),
          "bar-end": () => h("span", { class: "host-end" }, "end"),
        },
        ...editModeStubs,
      });
      expect(wrapper.find(".host-end").exists()).toBe(true);
      const vm = wrapper.vm as unknown as { getName: () => string; isDirty: () => boolean };
      expect(vm.isDirty()).toBe(false);
      await wrapper.find(".rename").trigger("click");
      expect(vm.getName()).toBe("Test Dungeon!");
      expect(vm.isDirty()).toBe(true);
    });

    it("shows the host's save state in the bar", () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false, saveState: "Saving…" }, ...editModeStubs });
      expect(wrapper.find("header").text()).toContain("Saving…");
    });
  });

  it("keeps the map's light level: edited from the bar's Light control, an unsaved change, restored by resetEdits", async () => {
    const wrapper = mount(MapWorkbench, {
      props: { map: { ...baseMap, darkness: "dim" }, viewMode: false },
      global: { stubs: { CampaignScopeField: true } },
    });
    const vm = wrapper.vm as unknown as {
      getDarkness: () => string;
      isDirty: () => boolean;
      resetEdits: () => void;
    };
    expect(vm.getDarkness()).toBe("dim");
    const dark = wrapper.findAll("button").find((b) => b.text() === "Dark");
    expect(dark).toBeDefined();
    await dark?.trigger("click");
    expect(vm.getDarkness()).toBe("dark");
    expect(vm.isDirty()).toBe(true);
    vm.resetEdits();
    expect(vm.getDarkness()).toBe("dim");
    expect(vm.isDirty()).toBe(false);
  });
});
