import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { emptyLayers, type DungeonMap } from "@/types/dungeonMap.types";

// Every read answers "nothing", whatever the chain: the editor's own queries are not what this file is about.
vi.mock("@/lib/supabase", () => {
  const empty = { data: [], error: null };
  const chain: unknown = new Proxy(() => chain, {
    get: (_t, key) => (key === "then" ? (resolve: (v: unknown) => void) => resolve(empty) : chain),
    apply: () => chain,
  });
  return { supabase: chain, getCurrentUser: () => ({ id: "u1" }) };
});
const nav = vi.hoisted(() => ({
  params: { id: "m1" } as Record<string, string>,
  push: vi.fn(),
  replace: vi.fn(),
  confirm: vi.fn(),
  del: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  nameInEditor: "Henge",
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: nav.confirm }) }));
vi.mock("@/composables/cartographer/useDungeonMaps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/cartographer/useDungeonMaps")>()),
  useDeleteDungeonMap: () => ({ mutateAsync: nav.del, isPending: { value: false } }),
  useUpdateDungeonMap: () => ({ mutateAsync: nav.update, isPending: { value: false } }),
  useCreateDungeonMap: () => ({ mutateAsync: nav.create, isPending: { value: false } }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: nav.params, query: {}, name: "cartographer-editor" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}));

import CartographerEditorView from "./CartographerEditorView.vue";

const map = { id: "m1", name: "Henge", rev: 3, campaign_id: null, layers: emptyLayers(), metadata: {}, tags: [] } as unknown as DungeonMap;

/** The workbench as a stand-in: it mounts a tick after the view's setup, as the real one does. */
const MapWorkbenchStub = defineComponent({
  name: "MapWorkbench",
  props: ["map", "viewMode", "saveState", "menuActions"],
  emits: ["update:dirty", "update:editRevision", "menu-action"],
  setup(_props, { expose }) {
    const revision = 0;
    expose({
      getLayers: () => emptyLayers(),
      getMetadata: () => ({}),
      getRuntimes: () => new Map(),
      getDressingCatalog: () => new Map(),
      loadDressingCatalog: async () => new Map(),
      getCellGlyphs: () => ({}),
      getStructure: () => ({ spaces: [], ways: [], stairs: [], links: [] }),
      getName: () => nav.nameInEditor,
      getCurrentPackId: () => "pack-1",
      getDarkness: () => "daylight",
      getCampaignId: () => null,
      getEditRevision: () => revision,
      markSaved: () => {},
      getPackName: () => "",
      getCellsPainted: () => 0,
      resetEdits: () => {},
    });
    return () => h("div");
  },
});

async function mountEditor(opts: { cached?: boolean; id?: string } = {}) {
  setActivePinia(createPinia());
  nav.params = opts.id === undefined ? { id: "m1" } : opts.id ? { id: opts.id } : {};
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  if (opts.cached !== false) client.setQueryData(["dungeon_maps", "m1"], map);
  const errors: unknown[] = [];
  const wrapper = mount(CartographerEditorView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: client }]],
      stubs: { MapWorkbench: MapWorkbenchStub, CartographerPublishModal: true, CartographerAiStyleModal: true },
      config: { errorHandler: (err) => void errors.push(err) },
    },
  });
  await flushPromises();
  return { wrapper, workbench: wrapper.findComponent(MapWorkbenchStub), errors };
}

// DUNGEON-GRIMOIRE-Q/R/S/T: with the map already in the cache, the publish
// composable read the workbench during setup, before it had mounted, and the
// editor threw instead of rendering.
describe("CartographerEditorView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const m of [nav.push, nav.replace, nav.confirm, nav.del, nav.update, nav.create]) m.mockReset();
    nav.del.mockResolvedValue(undefined);
    nav.update.mockResolvedValue({ id: "m1" });
    nav.create.mockResolvedValue({ id: "m9" });
    nav.nameInEditor = "Henge";
  });
  afterEach(() => vi.useRealTimers());

  it("opens a map that is already cached without reading the workbench before it mounts", async () => {
    const { errors, workbench } = await mountEditor();
    expect(errors).toEqual([]);
    expect(workbench.exists()).toBe(true);
  });

  // #1125 decision 4: always the editor, always autosaving.
  it("is always the editor: no view mode, and no Save, Cancel, Edit or Done to press", async () => {
    const { wrapper, workbench } = await mountEditor();
    expect(workbench.props("viewMode")).toBe(false);
    const labels = wrapper.findAll("button").map((b) => b.text());
    for (const gone of ["Save", "Cancel", "Edit", "Done"]) expect(labels).not.toContain(gone);
  });

  it("saves an edit on its own after the pause, under the trimmed name or 'Untitled Map' for a blank one", async () => {
    nav.nameInEditor = "   ";
    const { workbench } = await mountEditor();
    workbench.vm.$emit("update:editRevision", 1);
    await vi.advanceTimersByTimeAsync(1600);
    expect(nav.update.mock.calls[0]![0]).toMatchObject({ id: "m1", update: { name: "Untitled Map", default_pack_id: "pack-1" } });
    expect(nav.create).not.toHaveBeenCalled();
  });

  it("does not save before the pause ends: strokes are batched", async () => {
    const { workbench } = await mountEditor();
    workbench.vm.$emit("update:editRevision", 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(nav.update).not.toHaveBeenCalled();
  });

  it("creates a new map on its first edit, then moves the address to the new map instead of updating", async () => {
    const { workbench } = await mountEditor({ id: "", cached: false });
    workbench.vm.$emit("update:editRevision", 1);
    await vi.advanceTimersByTimeAsync(1600);
    expect(nav.create).toHaveBeenCalledTimes(1);
    expect(nav.update).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith({ path: "/cartographer/m9" });
  });

  describe("the Map menu", () => {
    it("offers Delete for a saved map, not for a new one", async () => {
      expect((await mountEditor()).workbench.props("menuActions")).toContain("delete");
      expect((await mountEditor({ id: "", cached: false })).workbench.props("menuActions")).not.toContain("delete");
    });

    it("keeps the map when the DM backs out of the delete confirmation", async () => {
      nav.confirm.mockResolvedValue(false);
      const { workbench } = await mountEditor();
      workbench.vm.$emit("menu-action", "delete");
      await flushPromises();
      expect(nav.confirm).toHaveBeenCalledWith('Delete "Henge"? This cannot be undone.');
      expect(nav.del).not.toHaveBeenCalled();
      expect(nav.push).not.toHaveBeenCalled();
    });

    it("deletes the map after confirming, then returns to the list", async () => {
      nav.confirm.mockResolvedValue(true);
      const { workbench } = await mountEditor();
      workbench.vm.$emit("menu-action", "delete");
      await flushPromises();
      expect(nav.del).toHaveBeenCalledWith("m1");
      expect(nav.push).toHaveBeenCalledWith("/cartographer");
    });
  });
});
