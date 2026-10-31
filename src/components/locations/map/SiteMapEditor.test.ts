import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import SiteMapEditor from "./SiteMapEditor.vue";
import { buildAtlasIndex } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line no-restricted-imports -- vi.hoisted runs before the file's imports
  const { ref } = require("vue") as typeof import("vue");
  return {
  workbench: ref<unknown>(null),
  /** What the canvas answers when the host reads it through the stub. */
  canvas: { current: null as unknown },
  sourceMap: ref<unknown>(null),
  push: vi.fn(),
  flush: vi.fn(),
  confirm: vi.fn(),
  deleteMap: vi.fn(),
  updateLocation: vi.fn(),
  publishOpen: { value: false },
  aiEnabled: { value: false },
  showStylePicker: { value: false },
  setPicture: vi.fn(),
  removePicture: vi.fn(),
  setCalibration: vi.fn(),
  setBattleMap: vi.fn(),
  exportVtt: vi.fn(),
  };
});

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ info: vi.fn(), error: vi.fn(), fromError: String }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return mocks.aiEnabled.value; } }) }));
vi.mock("@/composables/cartographer/useDungeonMaps", () => ({
  useDeleteDungeonMap: () => ({ mutateAsync: mocks.deleteMap }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useUpdateLocation: () => ({ mutateAsync: mocks.updateLocation }),
}));
vi.mock("@/composables/locations/useSiteStructure", () => ({
  useSiteStructure: () => ({}),
  useSiteMapExtras: () => ({
    staleness: computed(() => null),
    sourceMap: { data: mocks.sourceMap },
    layerCounts: computed(() => ({ spaces: 0, ways: 0, zones: 0 })),
  }),
}));
vi.mock("@/composables/locations/useSiteDrawingEditor", () => ({
  useSiteDrawingEditor: () => ({
    workbenchRef: mocks.workbench,
    dirty: ref(false),
    saving: ref(false),
    createdMapId: ref(null),
    onDirtyChange: vi.fn(),
    onEditRevision: vi.fn(),
    flush: mocks.flush,
  }),
}));
vi.mock("@/composables/locations/useAddSiteLevel", () => ({
  useAddSiteLevel: () => ({ addLevel: vi.fn(), isAdding: ref(false) }),
}));
vi.mock("@/composables/locations/usePlacePicture", () => ({
  usePlacePicture: () => ({
    busy: ref(false),
    setPicture: mocks.setPicture,
    removePicture: mocks.removePicture,
    setCalibration: mocks.setCalibration,
    setBattleMap: mocks.setBattleMap,
  }),
}));
vi.mock("@/lib/mapBring/exportDrawing", () => ({ exportDrawingAsVtt: mocks.exportVtt }));
vi.mock("@/composables/locations/useOpenSiteDrawing", () => ({ useOpenSiteDrawing: () => ({ openDrawing: vi.fn() }) }));
vi.mock("@/composables/cartographer/useMapPublish", () => ({
  useMapPublish: () => ({
    get open() { return mocks.publishOpen; },
    targetSiteId: ref(""),
    siteContext: ref(null),
    stairTargets: ref({}),
    review: ref({}),
    publish: vi.fn(),
  }),
}));
vi.mock("@/composables/cartographer/useMapExport", () => ({
  useMapExport: () => ({
    baking: ref(false),
    showStylePicker: mocks.showStylePicker,
    showStyleResult: ref(false),
    selectedPresetId: ref(""),
    stylePromptSuffix: ref(""),
    styleGenerating: ref(false),
    styleResultUrl: ref(null),
    styleError: ref(null),
    styleAtlasLocationId: ref(""),
    styleAtlasError: ref(null),
    styleAtlasSaving: ref(false),
    styleAtlasTargetHasMap: ref(false),
    styleFixedTargetLabel: ref(""),
    styleByok: ref(false),
    styleCost: ref(null),
    onGenerateStyle: vi.fn(),
    onRetryStyle: vi.fn(),
    onDownloadStyled: vi.fn(),
    onSaveStyledToAtlas: vi.fn(),
  }),
}));

const WorkbenchStub = defineComponent({
  name: "MapWorkbench",
  props: ["map", "site", "menuActions", "saveState", "startLayer", "defaultName"],
  emits: ["menu-action", "picture-upload", "picture-remove", "update:pictureCalibration", "update:isBattleMap"],
  setup(_p, { slots, expose }) {
    // The host reads the canvas through its template ref, which is this stub.
    const api = () => mocks.canvas.current as Record<string, (...a: unknown[]) => unknown>;
    expose({
      getLayers: () => api().getLayers(),
      getMetadata: () => api().getMetadata(),
      getRuntimes: () => api().getRuntimes(),
      loadDressingCatalog: () => api().loadDressingCatalog(),
      getCellGlyphs: () => api().getCellGlyphs(),
      getName: () => api().getName(),
    });
    return () => h("div", [slots["bar-start"]?.({ mapName: "", setName: () => {} }), slots["bar-end"]?.()]);
  },
});

function place(over: Partial<Location> & { id: string }): Location {
  return { campaign_id: "c", parent_id: null, name: over.id, location_type: "dungeon", is_level: false, source_map_id: null, ...over } as Location;
}

// AppButton renders a real RouterLink for `to`, which needs a router to resolve it.
const linkRouter = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }] });

function mountEditor(loc: Location, all: Location[] = [loc]) {
  return mount(SiteMapEditor, {
    props: { location: loc, index: buildAtlasIndex(all), backTo: "/locations?at=ash", startLayer: "drawing" },
    global: {
      plugins: [linkRouter],
      stubs: {
        MapWorkbench: WorkbenchStub,
        CartographerPublishModal: true,
        CartographerAiStyleModal: true,
        PaywallModal: true,
        SiteLevelPicker: true,
      },
    },
  });
}
const menuOf = (w: ReturnType<typeof mountEditor>) => w.findComponent(WorkbenchStub).props("menuActions") as string[];

beforeEach(() => {
  for (const m of [mocks.push, mocks.flush, mocks.confirm, mocks.deleteMap, mocks.updateLocation, mocks.setPicture, mocks.removePicture, mocks.setCalibration, mocks.setBattleMap, mocks.exportVtt]) m.mockReset();
  mocks.flush.mockResolvedValue(undefined);
  mocks.deleteMap.mockResolvedValue(undefined);
  mocks.updateLocation.mockResolvedValue({});
  mocks.publishOpen.value = false;
  mocks.canvas.current = null;
  mocks.sourceMap.value = null;
  mocks.aiEnabled.value = false;
  mocks.showStylePicker.value = false;
});

// #1125 frame 07: the site's full-screen editor and its Map menu.
describe("SiteMapEditor", () => {
  it("offers a Map menu only once a Drawing is saved: every entry works on that row", () => {
    expect(menuOf(mountEditor(place({ id: "ash" })))).toEqual([]);
    expect(menuOf(mountEditor(place({ id: "ash", source_map_id: "m1" })))).toEqual(["review", "download", "export-vtt", "delete"]);
  });

  it("offers Style with AI only when the campaign has AI on", () => {
    mocks.aiEnabled.value = true;
    expect(menuOf(mountEditor(place({ id: "ash", source_map_id: "m1" })))).toContain("style");
  });

  it("saves the drawing before opening the publish review (it reads the saved row's rev)", async () => {
    let finishSave!: () => void;
    mocks.flush.mockReturnValue(new Promise<void>((resolve) => { finishSave = resolve; }));
    const w = mountEditor(place({ id: "ash", source_map_id: "m1" }));
    w.findComponent(WorkbenchStub).vm.$emit("menu-action", "review");
    await flushPromises();
    expect(mocks.publishOpen.value).toBe(false);
    finishSave();
    await flushPromises();
    expect(mocks.publishOpen.value).toBe(true);
  });

  it("keeps the drawing when the DM backs out of deleting it", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountEditor(place({ id: "ash", source_map_id: "m1" }));
    w.findComponent(WorkbenchStub).vm.$emit("menu-action", "delete");
    await flushPromises();
    expect(mocks.deleteMap).not.toHaveBeenCalled();
    expect(mocks.updateLocation).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("deletes the drawing after confirming: unlinks it and takes its published layer off the site first, deletes the map, then returns to the Map tab", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountEditor(place({ id: "ash", source_map_id: "m1" }));
    w.findComponent(WorkbenchStub).vm.$emit("menu-action", "delete");
    await flushPromises();
    // A site left with the bake of a deleted drawing would go on showing it (#1125 review).
    expect(mocks.updateLocation).toHaveBeenCalledWith({
      id: "ash",
      update: {
        source_map_id: null,
        map_layer_url: null,
        map_layer_stand_url: null,
        map_layer_stand_live_url: null,
        map_layer_calibration: null,
        map_live: null,
        map_published_rev: null,
      },
    });
    expect(mocks.deleteMap).toHaveBeenCalledWith("m1");
    expect(mocks.updateLocation.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteMap.mock.invocationCallOrder[0]!);
    expect(mocks.push).toHaveBeenCalledWith("/locations?at=ash");
  });

  it("switches level by saving first, then opening that level's editor on the same layer", async () => {
    const w = mountEditor(place({ id: "ash" }));
    w.findComponent({ name: "SiteLevelPicker" }).vm.$emit("select", "cellar");
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledWith("/locations/cellar/map?layer=drawing");
    expect(mocks.flush.mock.invocationCallOrder[0]).toBeLessThan(mocks.push.mock.invocationCallOrder[0]!);
  });

  it("links the bar's back button to the Map tab, named for the place", () => {
    const w = mountEditor(place({ id: "ash", name: "Ashmouth" }));
    const back = w.findAllComponents({ name: "AppButton" }).find((b) => b.props("to"))!;
    expect(back.props("to")).toBe("/locations?at=ash");
    expect(back.props("label")).toBe("Ashmouth");
  });

  // #1125 frame 07: the Picture layer's writes belong to the host, which owns the place.
  describe("the Picture layer", () => {
    it("writes what the workbench's Picture palette asks for, and nothing else", () => {
      const w = mountEditor(place({ id: "ash" }));
      const wb = w.findComponent(WorkbenchStub);
      const file = new File(["x"], "m.png");
      wb.vm.$emit("picture-upload", file);
      wb.vm.$emit("picture-remove");
      wb.vm.$emit("update:pictureCalibration", { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0 });
      wb.vm.$emit("update:isBattleMap", true);
      expect(mocks.setPicture).toHaveBeenCalledWith(file);
      expect(mocks.removePicture).toHaveBeenCalledTimes(1);
      expect(mocks.setCalibration).toHaveBeenCalledWith({ cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0 });
      expect(mocks.setBattleMap).toHaveBeenCalledWith(true);
    });

    it("lets the workbench choose the layer when the address names none, so a picture with no grid opens on the Picture", () => {
      expect(mountEditor(place({ id: "ash" })).findComponent(WorkbenchStub).props("startLayer")).toBeUndefined();
    });

    it("names a new drawing after the site", () => {
      expect(mountEditor(place({ id: "ash", name: "Karkholok" })).findComponent(WorkbenchStub).props("defaultName")).toBe("Karkholok");
    });
  });

  it("exports the Drawing for another VTT under the map's name, with the canvas's live edits laid over the saved row, after saving", async () => {
    const runtimes = new Map();
    mocks.sourceMap.value = { id: "m1", name: "Ashmouth", layers: {}, metadata: {} };
    mocks.canvas.current = {
      getLayers: () => ({ live: true }),
      getMetadata: () => ({}),
      getRuntimes: () => runtimes,
      loadDressingCatalog: async () => new Map(),
      getCellGlyphs: () => ({}),
      getName: () => "Ash cellar",
    };
    const w = mountEditor(place({ id: "ash", name: "Ashmouth", source_map_id: "m1" }));
    w.findComponent(WorkbenchStub).vm.$emit("menu-action", "export-vtt");
    await flushPromises();
    expect(mocks.exportVtt).toHaveBeenCalledTimes(1);
    const [map, rt, , , fileName] = mocks.exportVtt.mock.calls[0]!;
    expect(map.layers).toEqual({ live: true });
    expect(rt).toBe(runtimes);
    expect(fileName).toBe("Ash cellar");
    expect(mocks.flush.mock.invocationCallOrder[0]).toBeLessThan(mocks.exportVtt.mock.invocationCallOrder[0]!);
  });
});
