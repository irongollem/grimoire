import { beforeEach, describe, expect, it, vi } from "vitest";
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
  query: {} as Record<string, string>,
  push: vi.fn(),
  replace: vi.fn(),
  confirm: vi.fn(),
  del: vi.fn(),
  update: vi.fn(),
  nameInEditor: "Henge",
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: nav.confirm }) }));
vi.mock("@/composables/cartographer/useDungeonMaps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/cartographer/useDungeonMaps")>()),
  useDeleteDungeonMap: () => ({ mutateAsync: nav.del, isPending: { value: false } }),
  useUpdateDungeonMap: () => ({ mutateAsync: nav.update, isPending: { value: false } }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "m1" }, query: nav.query, name: "cartographer-editor" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}));

import CartographerEditorView from "./CartographerEditorView.vue";

const map = { id: "m1", name: "Henge", rev: 3, campaign_id: null, layers: emptyLayers(), metadata: {}, tags: [] } as unknown as DungeonMap;

/** The workbench as a stand-in: it mounts a tick after the view's setup, as the real one does. */
const MapWorkbenchStub = defineComponent({
  name: "MapWorkbench",
  setup(_props, { expose, slots }) {
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
      markSaved: () => {},
      getPackName: () => "",
      getCellsPainted: () => 0,
      resetEdits: () => {},
    });
    return () => h("div", slots["bar-end"]?.());
  },
});

// DUNGEON-GRIMOIRE-Q/R/S/T: with the map already in the cache, the publish
// composable read the workbench during setup, before it had mounted, and the
// editor threw instead of rendering.
describe("CartographerEditorView", () => {
  it("opens a map that is already cached without reading the workbench before it mounts", async () => {
    setActivePinia(createPinia());
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    client.setQueryData(["dungeon_maps", "m1"], map);
    const errors: unknown[] = [];

    const wrapper = mount(CartographerEditorView, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient: client }]],
        stubs: { MapWorkbench: MapWorkbenchStub, CartographerPublishModal: true, CartographerAiStyleModal: true },
        config: { errorHandler: (err) => void errors.push(err) },
      },
    });
    await flushPromises();

    expect(errors).toEqual([]);
    expect(wrapper.text()).toContain("Publish to Atlas");
  });
});

describe("CartographerEditorView editing", () => {
  async function mountEditing() {
    setActivePinia(createPinia());
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    client.setQueryData(["dungeon_maps", "m1"], map);
    const wrapper = mount(CartographerEditorView, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient: client }]],
        stubs: { MapWorkbench: MapWorkbenchStub, CartographerPublishModal: true, CartographerAiStyleModal: true },
      },
    });
    await flushPromises();
    return wrapper;
  }
  const click = async (w: Awaited<ReturnType<typeof mountEditing>>, label: string) => {
    await w.findAll("button").find((b) => b.text() === label)!.trigger("click");
    await flushPromises();
  };

  beforeEach(() => {
    nav.query = { edit: "true" };
    nav.push.mockReset();
    nav.replace.mockReset();
    nav.confirm.mockReset();
    nav.del.mockReset().mockResolvedValue(undefined);
    nav.update.mockReset().mockResolvedValue({ id: "m1" });
    nav.nameInEditor = "Henge";
  });

  it("keeps the map when the DM backs out of the delete confirmation", async () => {
    nav.confirm.mockResolvedValue(false);
    const w = await mountEditing();
    await click(w, "Delete");
    expect(nav.confirm).toHaveBeenCalledWith('Delete "Henge"? This cannot be undone.');
    expect(nav.del).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("deletes the map after confirming, then returns to the list", async () => {
    nav.confirm.mockResolvedValue(true);
    const w = await mountEditing();
    await click(w, "Delete");
    expect(nav.del).toHaveBeenCalledWith("m1");
    expect(nav.push).toHaveBeenCalledWith("/cartographer");
  });

  it("saves the trimmed name, or 'Untitled Map' for a blank one, and drops back to view mode", async () => {
    nav.nameInEditor = "   ";
    const w = await mountEditing();
    await click(w, "Save");
    expect(nav.update.mock.calls[0][0]).toMatchObject({ id: "m1", update: { name: "Untitled Map", default_pack_id: "pack-1" } });
    expect(nav.replace).toHaveBeenCalledWith({ query: {} });
  });
});
