import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import SiteMapEditor from "./SiteMapEditor.vue";
import { buildAtlasIndex } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  flush: vi.fn(),
  confirm: vi.fn(),
  deleteMap: vi.fn(),
  updateLocation: vi.fn(),
  publishOpen: { value: false },
  aiEnabled: { value: false },
  showStylePicker: { value: false },
}));

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
    sourceMap: { data: ref(null) },
    layerCounts: computed(() => ({ spaces: 0, ways: 0, zones: 0 })),
  }),
}));
vi.mock("@/composables/locations/useSiteDrawingEditor", () => ({
  useSiteDrawingEditor: () => ({
    workbenchRef: ref(null),
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
  props: ["map", "site", "menuActions", "saveState"],
  emits: ["menu-action"],
  setup(_p, { slots }) {
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
        MapLayersPanel: true,
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
  for (const m of [mocks.push, mocks.flush, mocks.confirm, mocks.deleteMap, mocks.updateLocation]) m.mockReset();
  mocks.flush.mockResolvedValue(undefined);
  mocks.deleteMap.mockResolvedValue(undefined);
  mocks.updateLocation.mockResolvedValue({});
  mocks.publishOpen.value = false;
  mocks.aiEnabled.value = false;
  mocks.showStylePicker.value = false;
});

// #1125 frame 07: the site's full-screen editor and its Map menu.
describe("SiteMapEditor", () => {
  it("offers a Map menu only once a Drawing is saved: every entry works on that row", () => {
    expect(menuOf(mountEditor(place({ id: "ash" })))).toEqual([]);
    expect(menuOf(mountEditor(place({ id: "ash", source_map_id: "m1" })))).toEqual(["review", "download", "delete"]);
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
});
