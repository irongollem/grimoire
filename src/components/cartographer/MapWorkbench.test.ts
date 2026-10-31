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
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapWorkbench from "./MapWorkbench.vue";
import CartographerBar from "./CartographerBar.vue";
import CartographerToolRail from "./CartographerToolRail.vue";
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
vi.mock("@/composables/cartographer/useLibraryDressing", () => ({
  useDressingCatalog: () => ({ catalog: shallowRef(new Map()) }),
  useAllLibraryDressing: () => ({ data: ref([]) }),
}));
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
  setActivePinia(createPinia());
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

  it("keeps the browser's middle-press autoscroll off the canvas, and only for the middle button", () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: true } });
    const canvas = wrapper.find("canvas").element;
    const middle = new MouseEvent("mousedown", { button: 1, bubbles: true, cancelable: true });
    canvas.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(true);
    const left = new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true });
    canvas.dispatchEvent(left);
    expect(left.defaultPrevented).toBe(false);
  });

  it("takes Space only while the pointer is over the map", () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: true } });
    const area = wrapper.find("canvas").element.parentElement as HTMLElement;
    const space = (): KeyboardEvent => new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true });

    const away = space();
    window.dispatchEvent(away);
    expect(away.defaultPrevented).toBe(false);

    area.dispatchEvent(new Event("pointerenter"));
    const over = space();
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);

    area.dispatchEvent(new Event("pointerleave"));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" }));
    const left = space();
    window.dispatchEvent(left);
    expect(left.defaultPrevented).toBe(false);
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
        SiteWaysOutPanel: true,
      },
    },
  };

  it("shows no layer selector or Plan palette without a site, even in edit mode", () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
    expect(wrapper.text()).not.toContain("Drawing");
    expect(tool(wrapper, "Claim")).toBe(false);
  });

  it("offers the Water terrain tool in the Drawing palette, in the Terrain family's slip", async () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
    expect(tool(wrapper, "Terrain")).toBe(true);
    await wrapper.find('nav[aria-label="Map tools"] [aria-label="Terrain"]').trigger("click");
    expect(wrapper.find("[data-slip]").text()).toContain("Water");
  });

  it("shows the layer selector with a site, in edit mode, and can switch layers by hand", async () => {
    const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false, site: siteWithNoImagery }, ...editModeStubs });
    expect(wrapper.text()).toContain("Drawing");
    expect(wrapper.text()).toContain("Plan");
    // A site with nothing drawn yet opens on the Drawing's own tool palette…
    expect(tool(wrapper, "Draw")).toBe(true);

    const planButton = wrapper.findAll("button").find((b) => b.text() === "Plan");
    await planButton?.trigger("click");
    // …and switches to the Plan's four tools once selected by hand.
    expect(tool(wrapper, "Claim")).toBe(true);
  });

  it("shows the Plan drawer's Spaces, Zones and Ways out, all of them editable (#1125 story 5)", () => {
    const wrapper = mount(MapWorkbench, {
      props: { map: baseMap, viewMode: false, site: siteWithPicture },
      ...editModeStubs,
    });
    expect(wrapper.findComponent({ name: "SiteMapRegionList" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "SiteMapZoneList" }).exists()).toBe(true);
    const ways = wrapper.findComponent({ name: "SiteWaysOutPanel" });
    expect(ways.props("editable")).toBe(true);
    expect(ways.props("siteId")).toBe(siteWithPicture.id);
  });

  // #878 S2 — the DM who traced rooms could never find Pen/Shape because
  // Build always opened on the Drawing, even for a site that already had
  // imagery to trace over. These four cover the new initial-default rule.
  describe("initial layer default (#878 S2)", () => {
    it("opens on Drawing without a site at all (the standalone /cartographer route)", () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      expect(tool(wrapper, "Draw")).toBe(true);
      expect(tool(wrapper, "Claim")).toBe(false);
    });

    it("opens on Drawing for a site with no map imagery yet", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithNoImagery },
        ...editModeStubs,
      });
      expect(tool(wrapper, "Draw")).toBe(true);
      expect(tool(wrapper, "Claim")).toBe(false);
    });

    it("opens on Plan for a site whose imagery is a Picture", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithPicture },
        ...editModeStubs,
      });
      expect(tool(wrapper, "Claim")).toBe(true);
      // "Draw" only ever appears on the Drawing's own rail.
      expect(tool(wrapper, "Draw")).toBe(false);
    });

    it("opens on Plan for a site whose imagery is a Drawing (no Picture)", () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithDrawing },
        ...editModeStubs,
      });
      expect(tool(wrapper, "Claim")).toBe(true);
      expect(tool(wrapper, "Draw")).toBe(false);
    });

    it("opens on the layer the host was sent for, over the default (a \"Place it\" link asks for the Plan)", () => {
      const plan = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithNoImagery, startLayer: "plan" },
        ...editModeStubs,
      });
      expect(tool(plan, "Claim")).toBe(true);
      const drawing = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false, site: siteWithPicture, startLayer: "drawing" },
        ...editModeStubs,
      });
      expect(tool(drawing, "Draw")).toBe(true);
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
      expect(tool(wrapper, "Draw")).toBe(true);

      // …a prop change that would re-run any watcher must not force Plan
      // back — the default is read once at setup, never re-applied.
      await wrapper.setProps({ map: { ...baseMap, name: "Renamed" } });
      expect(tool(wrapper, "Draw")).toBe(true);
      expect(tool(wrapper, "Claim")).toBe(false);
    });
  });

  // #889 S6 — the picker used to be a hardcoded BUNDLED_PACKS array; it now
  // reads the `library_tile_packs` table via `useLibraryTilePacks`.
  // #1125 canvas frame 07: the Picture is a layer of its own, and an uncalibrated one is fitted, not black.
  describe("the Picture layer (#1125)", () => {
    const uncalibrated: MapStackSource & { id: string; is_battle_map: boolean } = {
      ...siteWithPicture,
      id: "karkholok",
      grid_calibration: null,
      is_battle_map: false,
    };

    /** An image that decodes at once to a 3000 x 2000 picture, which jsdom never does. */
    class DecodedImage {
      naturalWidth = 3000;
      naturalHeight = 2000;
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    beforeEach(() => { vi.stubGlobal("Image", DecodedImage); });
    afterEach(() => { vi.unstubAllGlobals(); });

    const mountPicture = async (site: MapStackSource & { id: string; is_battle_map?: boolean }, extra: object = {}) => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false, site, ...extra }, ...editModeStubs });
      await flushPromises();
      return wrapper;
    };
    const press = (wrapper: ReturnType<typeof mount>, label: string) =>
      wrapper.findAll("button").find((b) => b.text() === label)!.trigger("click");

    it("offers Picture, Drawing and Plan, in that order", async () => {
      const wrapper = await mountPicture(uncalibrated);
      const labels = wrapper.findAll("button").map((b) => b.text()).filter((t) => ["Picture", "Drawing", "Plan"].includes(t));
      expect(labels).toEqual(["Picture", "Drawing", "Plan"]);
    });

    it("opens a site whose only map is a picture with no grid on the Picture, not on a black canvas", async () => {
      const wrapper = await mountPicture(uncalibrated);
      expect(wrapper.find("[data-slip]").text()).toContain("Line up the grid to trace and draw over it.");
      expect(wrapper.find('img[alt="The picture under this map"]').exists()).toBe(true);
    });

    it("still opens on the Plan for a picture that has its grid (nothing to line up)", async () => {
      const wrapper = await mountPicture({ ...siteWithPicture, is_battle_map: false });
      expect(tool(wrapper, "Claim")).toBe(true);
    });

    it("lines the grid up on the picture and hands the host the result only when Done is pressed", async () => {
      const wrapper = await mountPicture(uncalibrated);
      await press(wrapper, "Line up the grid");
      expect(wrapper.findComponent({ name: "MapGridLineUp" }).exists()).toBe(true);
      expect(wrapper.emitted("update:pictureCalibration")).toBeUndefined();

      await press(wrapper, "Done");
      const [written] = wrapper.emitted("update:pictureCalibration")![0] as [{ cells_per_image_width: number }];
      expect(written.cells_per_image_width).toBe(30);
      expect(wrapper.findComponent({ name: "MapGridLineUp" }).exists()).toBe(false);
    });

    it("throws the grid away on Cancel", async () => {
      const wrapper = await mountPicture(uncalibrated);
      await press(wrapper, "Line up the grid");
      await press(wrapper, "Cancel");
      expect(wrapper.emitted("update:pictureCalibration")).toBeUndefined();
    });

    it("keeps the origin cell a publish wrote when the grid is lined up again", async () => {
      const styled = { ...siteWithPicture, is_battle_map: false, grid_calibration: { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 4, origin_cell_y: 7 } };
      const wrapper = await mountPicture(styled, { startLayer: "picture" });
      await press(wrapper, "Line up the grid");
      // Changing the count rebuilds the grid; the origin cell is not part of what the DM is lining up.
      const across = wrapper.find('input[aria-label="Squares across"]');
      await across.setValue("20");
      await across.trigger("change");
      await press(wrapper, "Done");
      expect(wrapper.emitted("update:pictureCalibration")![0][0]).toMatchObject({ cells_per_image_width: 20, origin_cell_x: 4, origin_cell_y: 7 });
    });

    it("hands the host the upload, the removal and the battle-map flag; it writes none of them itself", async () => {
      const wrapper = await mountPicture({ ...uncalibrated, is_battle_map: true });
      await press(wrapper, "Remove");
      expect(wrapper.emitted("picture-remove")).toHaveLength(1);
      const file = new File(["x"], "m.png", { type: "image/png" });
      const input = wrapper.find('input[type="file"]');
      Object.defineProperty(input.element, "files", { value: [file] });
      await input.trigger("change");
      expect(wrapper.emitted("picture-upload")![0]).toEqual([file]);
      await wrapper.find('input[type="checkbox"]').setValue(false);
      expect(wrapper.emitted("update:isBattleMap")![0]).toEqual([false]);
    });

    it("names an unnamed drawing after the site, not 'Untitled Map'", async () => {
      const wrapper = await mountPicture(siteWithNoImagery, { map: null, defaultName: "Karkholok" });
      expect((wrapper.vm as unknown as { getName(): string }).getName()).toBe("Karkholok");
    });
  });

  describe("tile-pack picker reads the library table (#889 S6)", () => {
    it("offers published library packs instead of a hardcoded list, and excludes drafts", async () => {
      mockLibraryRows.value = [
        libraryPack({ pack_id: "sunny-meadow", name: "Sunny Meadow", sort_order: 0 }),
        libraryPack({ pack_id: "unpublished-pack", name: "Draft Pack", status: "draft", sort_order: 1 }),
      ];
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      await flushPromises();

      const bundledPacks = wrapper.findComponent(CartographerToolRail).props("tileSet")?.packs;
      expect(bundledPacks?.map((p) => p.pack_id)).toEqual(["sunny-meadow"]);
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
      const bundledPacks = wrapper.findComponent(CartographerToolRail).props("tileSet")?.packs;
      expect(bundledPacks?.map((p) => p.pack_id)).toEqual(["stone-dungeon", "no-assets"]);

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

      wrapper.findComponent(CartographerToolRail).vm.$emit("update:currentPackId", "icy-cave");
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
  describe("the two tile sets (#1125)", () => {
    async function twoSets() {
      mockLibraryRows.value = [
        libraryPack({ pack_id: "stone-dungeon", name: "Stone Dungeon", sort_order: 0 }),
        libraryPack({ pack_id: "icy-cave", name: "Icy Cave", sort_order: 1 }),
      ];
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      await flushPromises();
      return wrapper;
    }
    const activeSet = (w: Awaited<ReturnType<typeof twoSets>>) => (w.vm as unknown as { getCurrentPackId: () => string }).getCurrentPackId();
    const secondSet = (w: Awaited<ReturnType<typeof twoSets>>) => w.findComponent(CartographerToolRail).props("tileSet")?.secondPackId;

    it("Shift+X swaps the active and second sets, so later strokes paint with the new active one", async () => {
      const w = await twoSets();
      expect([activeSet(w), secondSet(w)]).toEqual(["stone-dungeon", "icy-cave"]);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "X", code: "KeyX", shiftKey: true }));
      await flushPromises();
      expect([activeSet(w), secondSet(w)]).toEqual(["icy-cave", "stone-dungeon"]);
    });

    it("choosing the second set from its flyout leaves the active one alone", async () => {
      const w = await twoSets();
      w.findComponent(CartographerToolRail).vm.$emit("update:secondPackId", "stone-dungeon");
      await flushPromises();
      expect(activeSet(w)).toBe("stone-dungeon");
    });

    it("hides the swatches on the Plan layer, which paints no tiles", async () => {
      const w = mount(MapWorkbench, { props: { map: baseMap, viewMode: false, site: siteWithNoImagery }, ...editModeStubs });
      await flushPromises();
      expect(w.findComponent(CartographerToolRail).props("tileSet")).toBeDefined();
      await w.findAll("button").find((b) => b.text() === "Plan")?.trigger("click");
      expect(w.findComponent(CartographerToolRail).props("tileSet")).toBeUndefined();
    });
  });

  describe("the slim bar, rail and slip (17 Oct 2026)", () => {
    it("draws seven families in the order of canvas frame 07, with Erase after the rule", () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      const names = wrapper.findAll('nav[aria-label="Map tools"] button').map((b) => b.attributes("aria-label"));
      expect(names.slice(0, 7)).toEqual(["Select", "Draw", "Walls", "Things", "Terrain", "Notes", "Erase"]);
    });

    it("files every tool in one family, with the keys it always had (#1125 decision 3)", async () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      const nav = wrapper.find('nav[aria-label="Map tools"]');
      const slipTools: Record<string, string[]> = {};
      for (const family of ["Select", "Draw", "Walls", "Terrain", "Notes"]) {
        await nav.find(`[aria-label="${family}"]`).trigger("click");
        slipTools[family] = wrapper.findAll(`[data-slip] [aria-label="${family} tools"] button`).map((b) => b.text());
      }
      expect(slipTools).toEqual({
        Select: ["SelectV", "PanH"],
        Draw: ["BrushB", "RectangleR", "RoomM", "LineL", "FillF", "One tileI"],
        Walls: ["WallW", "DoorD", "WrapX", "Angled wallN"],
        Terrain: ["WaterA", "RockS"],
        Notes: ["LabelT", "LinkK", "SpaceP"],
      });
    });

    it("files Light beside Place in Things, and U picks it with its own options in the slip (#1125 story 5)", async () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      const area = wrapper.find("canvas").element.parentElement as HTMLElement;
      area.dispatchEvent(new Event("pointerenter"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "u", code: "KeyU" }));
      await flushPromises();
      const tools = wrapper.findAll('[data-slip] [aria-label="Things tools"] button').map((b) => b.text());
      expect(tools).toEqual(["PlaceO", "LightU"]);
      const slip = wrapper.find("[data-slip]").text();
      expect(slip).toContain("Bright ft");
      expect(slip).toContain("Dim ft");
      expect(slip).toContain("Flicker");
    });

    it("titles the slip with the family and follows a tool picked in its grid", async () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      const slip = () => wrapper.find("[data-slip]");
      expect(slip().text()).toContain("Select");
      await wrapper.find('nav[aria-label="Map tools"] [aria-label="Terrain"]').trigger("click");
      expect(slip().text()).toContain("Terrain");
      const rock = wrapper.findAll('[data-slip] [aria-label="Terrain tools"] button').find((b) => b.text().startsWith("Rock"));
      await rock?.trigger("click");
      expect(slip().text()).toContain("Paint thick, full-cell rock");
      // The rail still says Terrain: Rock is a tool inside it, not a family of its own.
      expect(wrapper.find('nav[aria-label="Map tools"] [aria-label="Terrain"]').attributes("aria-pressed")).toBe("true");
    });

    it("selects a tool's family when its key is pressed (R lands in Draw)", async () => {
      const wrapper = mount(MapWorkbench, { props: { map: baseMap, viewMode: false }, ...editModeStubs });
      const area = wrapper.find("canvas").element.parentElement as HTMLElement;
      area.dispatchEvent(new Event("pointerenter"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", code: "KeyR" }));
      await flushPromises();
      expect(wrapper.find('nav[aria-label="Map tools"] [aria-label="Draw"]').attributes("aria-pressed")).toBe("true");
      expect(wrapper.find("[data-slip]").text()).toContain("Drag a rectangle of floor");
    });

    it("opens the Spaces drawer from the Map menu and closes it from the drawer's own button", async () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false },
        global: { stubs: { ...editModeStubs.global.stubs, CampaignScopeField: true } },
      });
      expect(wrapper.find("section[aria-label='Spaces on this map']").exists()).toBe(false);
      await wrapper.findAll("header button").find((b) => b.text() === "Map")?.trigger("click");
      const spaces = [...document.body.querySelectorAll("[role=dialog] button")].find((b) => b.textContent?.includes("Spaces on this map"));
      (spaces as HTMLElement).click();
      await flushPromises();
      expect(wrapper.find("section[aria-label='Spaces on this map']").exists()).toBe(true);
      await wrapper.find("[aria-label='Close Spaces on this map']").trigger("click");
      expect(wrapper.find("section[aria-label='Spaces on this map']").exists()).toBe(false);
    });

    it("opens the Place catalogue with its tool and puts it away with the next one", async () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false },
        global: { stubs: { ...editModeStubs.global.stubs, CartographerPlaceCatalog: true } },
      });
      await wrapper.find('nav[aria-label="Map tools"] [aria-label="Things"]').trigger("click");
      expect(wrapper.find("section[aria-label='Place']").exists()).toBe(true);
      await wrapper.find('nav[aria-label="Map tools"] [aria-label="Draw"]').trigger("click");
      expect(wrapper.find("section[aria-label='Place']").exists()).toBe(false);
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

    it("does not call a rename to the same name an unsaved change", async () => {
      const wrapper = mount(MapWorkbench, {
        props: { map: baseMap, viewMode: false },
        slots: {
          "bar-start": (slot: { mapName: string; setName: (v: string) => void }) =>
            h("button", { class: "same-name", onClick: () => slot.setName(slot.mapName) }, slot.mapName),
        },
        ...editModeStubs,
      });
      const vm = wrapper.vm as unknown as { isDirty: () => boolean };
      await wrapper.find(".same-name").trigger("click");
      expect(vm.isDirty()).toBe(false);
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
    await wrapper.findAll("header button").find((b) => b.text() === "Map")?.trigger("click");
    const dark = [...document.body.querySelectorAll("[role=dialog] button")].find((b) => b.textContent === "Dark");
    expect(dark).toBeDefined();
    (dark as HTMLElement).click();
    await flushPromises();
    expect(vm.getDarkness()).toBe("dark");
    expect(vm.isDirty()).toBe(true);
    vm.resetEdits();
    expect(vm.getDarkness()).toBe("dim");
    expect(vm.isDirty()).toBe(false);
  });
});
