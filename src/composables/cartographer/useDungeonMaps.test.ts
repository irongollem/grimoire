import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import type { DungeonMap } from "@/types/dungeonMap.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

import { applyDiscs, emptyLegacy } from "@/test/legacyArea";
import { useCampaignStore } from "@/stores/campaign";
import { flushPromises } from "@vue/test-utils";
import { useCreateDungeonMap, useDeleteDungeonMap, useDungeonMap, useDungeonMaps, useUpdateDungeonMap } from "./useDungeonMaps";

/** A row as an old build stored it on the device: no `terrain` or `dressing` layer. */
const legacyRow = {
  id: "m1",
  name: "Old crypt",
  campaign_id: null,
  layers: { floor: { "1,1": "stone" }, solidBlock: {}, object: {}, annotation: {} },
} as unknown as DungeonMap;

beforeEach(() => {
  fake.reset();
  session.user = { id: "u1" };
});

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
    expect(map.layers.terrain).toEqual({});
    expect(map.layers.floor).toEqual({ "1,1": "stone" });
  });

  it("does the same for a single map", () => {
    const { data } = mountWith((c) => c.setQueryData(["dungeon_maps", "m1"], legacyRow), () => useDungeonMap("m1"));
    expect((data.value as DungeonMap).layers.dressing).toEqual({});
  });
});

describe("useDungeonMaps campaign scoping (#789)", () => {
  const maps = [
    { ...legacyRow, id: "global", campaign_id: null },
    { ...legacyRow, id: "mine", campaign_id: "camp-a" },
    { ...legacyRow, id: "other", campaign_id: "camp-b" },
  ];

  it("lists the maps for every campaign plus those scoped to the active one, and not another campaign's", () => {
    const { data } = mountWith((c) => c.setQueryData(["dungeon_maps"], maps), () => {
      useCampaignStore().activeCampaignId = "camp-a";
      return useDungeonMaps();
    });
    expect((data.value as DungeonMap[]).map((m) => m.id).sort()).toEqual(["global", "mine"]);
  });
});

describe("dungeon map writes", () => {
  function run<T>(use: () => T): T {
    return mountWith(() => undefined, use as () => { data: { value: unknown } }) as unknown as T;
  }

  it("creates a map for the signed-in user that is for every campaign unless one is named, with all its layers", async () => {
    // The campaign being played in is not inherited: a map is for every campaign unless one is named.
    const created = await run(() => {
      useCampaignStore().activeCampaignId = "camp-a";
      return useCreateDungeonMap();
    }).mutateAsync({ name: "Crypt" });
    expect(created.layers.terrain).toEqual({});
    expect(fake.rows("dungeon_maps")).toMatchObject([{ name: "Crypt", user_id: "u1", campaign_id: null, darkness: "daylight" }]);
  });

  it("refuses to create a map when no one is signed in", async () => {
    session.user = null;
    await expect(run(() => useCreateDungeonMap()).mutateAsync({ name: "Crypt" })).rejects.toThrow("Not authenticated");
    expect(fake.calls).toEqual([]);
  });

  it("updates and deletes the named map only", async () => {
    fake.seed("dungeon_maps", [
      { id: "m1", name: "One", layers: {} },
      { id: "m2", name: "Two", layers: {} },
    ]);
    await run(() => useUpdateDungeonMap()).mutateAsync({ id: "m1", update: { name: "Renamed" } });
    expect(fake.rows("dungeon_maps").map((m) => m.name)).toEqual(["Renamed", "Two"]);
    await run(() => useDeleteDungeonMap()).mutateAsync("m2");
    expect(fake.rows("dungeon_maps").map((m) => m.id)).toEqual(["m1"]);
  });

  it("lists the user's maps newest first and throws a failed read", async () => {
    fake.seed("dungeon_maps", [
      { id: "old", campaign_id: null, layers: {}, updated_at: "2026-01-01" },
      { id: "new", campaign_id: null, layers: {}, updated_at: "2026-02-01" },
    ]);
    const listed = run(() => useDungeonMaps()) as unknown as ReturnType<typeof useDungeonMaps>;
    await flushPromises();
    expect(listed.data.value?.map((m) => m.id)).toEqual(["new", "old"]);
  });
});

// The round brush used to store coverage masks in `layers.area` (#1125 retired it). A row saved that way is made into
// walls the first time it is read, and written back once so the new wall ids are the ones every later read sees.
describe("a map saved with brushed coverage", () => {
  const ref = { pack_id: "p", pack_version: 1, variant: 0 };
  const run = <T,>(use: () => T): T => mountWith(() => undefined, use as () => { data: { value: unknown } }) as unknown as T;
  const brushedRow = (user: string) => ({
    id: "m1",
    user_id: user,
    name: "Chapel",
    campaign_id: null,
    layers: applyDiscs(emptyLegacy(), [{ x: 6, y: 6, r: 3 }], ref, "paint"),
  });

  it("comes back as walls with no area, and the first read writes that back, so the wall ids stay the same", async () => {
    fake.seed("dungeon_maps", [brushedRow("u1")]);
    const first = run(() => useDungeonMap("m1")) as unknown as ReturnType<typeof useDungeonMap>;
    await flushPromises();
    const read = first.data.value as DungeonMap;
    expect("area" in read.layers).toBe(false);
    expect(Object.keys(read.layers.walls).length).toBeGreaterThan(0);
    const stored = fake.rows("dungeon_maps")[0].layers as Record<string, unknown>;
    expect("area" in stored).toBe(false);
    expect(Object.keys(stored.walls as object).sort()).toEqual(Object.keys(read.layers.walls).sort());

    // A second read finds nothing left to convert: same ids, and no second write.
    const writes = fake.calls.filter((c) => JSON.stringify(c).includes("update")).length;
    const second = run(() => useDungeonMap("m1")) as unknown as ReturnType<typeof useDungeonMap>;
    await flushPromises();
    expect(Object.keys((second.data.value as DungeonMap).layers.walls).sort()).toEqual(Object.keys(read.layers.walls).sort());
    expect(fake.calls.filter((c) => JSON.stringify(c).includes("update")).length).toBe(writes);
  });

  it("converts another account's map in memory only, and never writes a row it does not own", async () => {
    fake.seed("dungeon_maps", [brushedRow("someone-else")]);
    const q = run(() => useDungeonMap("m1")) as unknown as ReturnType<typeof useDungeonMap>;
    await flushPromises();
    expect("area" in (q.data.value as DungeonMap).layers).toBe(false);
    expect("area" in (fake.rows("dungeon_maps")[0].layers as object)).toBe(true);
  });
});
