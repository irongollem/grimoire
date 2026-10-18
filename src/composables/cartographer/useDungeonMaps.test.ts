import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import type { DungeonMap } from "@/types/dungeonMap.types";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() }, getCurrentUser: vi.fn() }));

import { useDungeonMap, useDungeonMaps } from "./useDungeonMaps";

/** A row as an old build stored it on the device: no `terrain`, `dressing` or `area` layer. */
const legacyRow = {
  id: "m1",
  name: "Old crypt",
  campaign_id: null,
  layers: { floor: { "1,1": "stone" }, solidBlock: {}, object: {}, annotation: {} },
} as unknown as DungeonMap;

function mountWith(seed: (client: QueryClient) => void, use: () => { data: { value: unknown } }) {
  setActivePinia(createPinia());
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  seed(client);
  let result!: { data: { value: unknown } };
  mount(defineComponent({ setup: () => ((result = use()), () => h("div")) }), {
    global: { plugins: [createPinia(), [VueQueryPlugin, { queryClient: client }]] },
  });
  return result;
}

// Sentry DUNGEON-GRIMOIRE-P: a disk copy of the list is served without running
// the queryFn, so normalising there let an old build's rows through raw.
describe("useDungeonMaps", () => {
  it("fills missing layers on data that did not come through the fetch", () => {
    const { data } = mountWith((c) => c.setQueryData(["dungeon_maps"], [legacyRow]), useDungeonMaps);
    const [map] = data.value as DungeonMap[];
    expect(map.layers.area).toEqual({});
    expect(map.layers.terrain).toEqual({});
    expect(map.layers.floor).toEqual({ "1,1": "stone" });
  });

  it("does the same for a single map", () => {
    const { data } = mountWith((c) => c.setQueryData(["dungeon_maps", "m1"], legacyRow), () => useDungeonMap("m1"));
    expect((data.value as DungeonMap).layers.dressing).toEqual({});
  });
});
