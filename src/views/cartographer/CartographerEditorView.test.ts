import { describe, expect, it, vi } from "vitest";
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
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "m1" }, query: {}, name: "cartographer-editor" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}));

import CartographerEditorView from "./CartographerEditorView.vue";

const map = { id: "m1", name: "Henge", rev: 3, campaign_id: null, layers: emptyLayers(), metadata: {}, tags: [] } as unknown as DungeonMap;

/** The workbench as a stand-in: it mounts a tick after the view's setup, as the real one does. */
const MapWorkbenchStub = defineComponent({
  name: "MapWorkbench",
  setup(_props, { expose }) {
    expose({
      getLayers: () => emptyLayers(),
      getMetadata: () => ({}),
      getRuntimes: () => new Map(),
      getDressingCatalog: () => new Map(),
      loadDressingCatalog: async () => new Map(),
      getCellGlyphs: () => ({}),
      getStructure: () => ({ spaces: [], ways: [], stairs: [], links: [] }),
      getName: () => "Henge",
      getPackName: () => "",
      getCellsPainted: () => 0,
      resetEdits: () => {},
    });
    return () => h("div");
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
