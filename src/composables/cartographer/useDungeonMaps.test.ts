import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { emptyLayers, type DungeonMap, type DungeonMapLayers } from "@/types/dungeonMap.types";
import { projectGround } from "@/cartographer/groundRegions";

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
const legacyRow: Omit<DungeonMap, "layers"> & { layers: Partial<DungeonMapLayers> } = {
  id: "m1",
  user_id: "u1",
  name: "Old crypt",
  campaign_id: null,
  description: null,
  metadata: {},
  default_pack_id: null,
  darkness: "daylight",
  tags: [],
  notes: null,
  rev: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  layers: { floor: { "1,1": { floor: { pack_id: "stone", pack_version: 1, variant: 0 } } }, solidBlock: {}, object: {}, annotation: {} },
};

beforeEach(() => {
  fake.reset();
  session.user = { id: "u1" };
});

function mountWith<T>(seed: (client: QueryClient) => void, use: () => T): T {
  setActivePinia(createPinia());
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  seed(client);
  let result!: T;
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
    expect(map.layers.floor).toEqual(legacyRow.layers.floor);
    expect(Object.keys(map.layers.ground)).toHaveLength(1);
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
    return mountWith(() => undefined, use);
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
    const listed = run(() => useDungeonMaps());
    await flushPromises();
    expect(listed.data.value?.map((m) => m.id)).toEqual(["new", "old"]);
  });
});

// The round brush used to store coverage masks in `layers.area` (#1125 retired it). A row saved that way is made into
// walls the first time it is read, and written back once so the new wall ids are the ones every later read sees.
describe("a map saved with brushed coverage", () => {
  const ref = { pack_id: "p", pack_version: 1, variant: 0 };
  const run = <T,>(use: () => T): T => mountWith(() => undefined, use);
  const brushedRow = (user: string) => {
    const { ground: _ground, ...stored } = applyDiscs(emptyLegacy(), [{ x: 6, y: 6, r: 3 }], ref, "paint");
    return {
      id: "m1",
      user_id: user,
      name: "Chapel",
      campaign_id: null,
      layers: stored,
    };
  };

  it("comes back as walls with no area, and the first read writes that back, so the wall ids stay the same", async () => {
    fake.seed("dungeon_maps", [brushedRow("u1")]);
    const first = run(() => useDungeonMap("m1"));
    await flushPromises();
    const read = first.data.value as DungeonMap;
    expect("area" in read.layers).toBe(false);
    expect(Object.keys(read.layers.walls).length).toBeGreaterThan(0);
    const stored = fake.rows("dungeon_maps")[0].layers as Record<string, unknown>;
    expect("area" in stored).toBe(false);
    expect(Object.keys(stored.walls as object).sort()).toEqual(Object.keys(read.layers.walls).sort());

    // A second read finds nothing left to convert: same ids, and no second write.
    const writes = fake.calls.filter((c) => JSON.stringify(c).includes("update")).length;
    const second = run(() => useDungeonMap("m1"));
    await flushPromises();
    expect(Object.keys((second.data.value as DungeonMap).layers.walls).sort()).toEqual(Object.keys(read.layers.walls).sort());
    expect(fake.calls.filter((c) => JSON.stringify(c).includes("update")).length).toBe(writes);
  });

  it("converts another account's map in memory only, and never writes a row it does not own", async () => {
    fake.seed("dungeon_maps", [brushedRow("someone-else")]);
    const q = run(() => useDungeonMap("m1"));
    await flushPromises();
    expect("area" in (q.data.value as DungeonMap).layers).toBe(false);
    expect("area" in (fake.rows("dungeon_maps")[0].layers as object)).toBe(true);
  });
});

describe("stored cell floors become editable source regions", () => {
  const sand = { pack_id: "sand", pack_version: 2, variant: 0 };
  const water = { pack_id: "water", pack_version: 1, variant: 4 };
  const run = <T,>(use: () => T): T => mountWith(() => undefined, use);
  function savedRow(user: string) {
    const { ground: _ground, ...layers } = emptyLayers();
    layers.floor["0,0"] = { floor: { ...sand, variant: 2 } };
    layers.floor["1,0"] = { floor: { ...sand, variant: 7 } };
    layers.terrain["1,0"] = water;
    layers.walls.wall = { type: "wall", ...sand, a: [0, 0], b: [2, 0], visible: false };
    layers.annotation["0,0"] = { text: "Dune" };
    return { id: "m1", user_id: user, name: "Desert", campaign_id: null, layers };
  }

  it("writes the owner's converted sources once and preserves their ids and varied tiles on later reads", async () => {
    const raw = savedRow("u1");
    fake.seed("dungeon_maps", [raw]);
    const first = run(() => useDungeonMap("m1"));
    await flushPromises();
    const firstMap = first.data.value;
    if (!firstMap) throw new Error("Map did not load");
    const ids = Object.keys(firstMap.layers.ground);
    expect(ids).toHaveLength(2);
    expect(projectGround(firstMap.layers).floor).toEqual(raw.layers.floor);
    expect(projectGround(firstMap.layers).terrain).toEqual(raw.layers.terrain);
    expect(firstMap.layers.walls).toEqual(raw.layers.walls);
    expect(firstMap.layers.annotation).toEqual(raw.layers.annotation);
    expect((fake.rows("dungeon_maps")[0].layers as DungeonMapLayers).ground).toEqual(firstMap.layers.ground);

    const writes = fake.calls.filter((call) => call.op === "update").length;
    const second = run(() => useDungeonMap("m1"));
    await flushPromises();
    expect(Object.keys(second.data.value?.layers.ground ?? {})).toEqual(ids);
    expect(second.data.value?.layers.ground).toEqual(firstMap.layers.ground);
    expect(fake.calls.filter((call) => call.op === "update")).toHaveLength(writes);
  });

  it("converts a different owner's cells in memory without saving or changing their stored map", async () => {
    const raw = savedRow("another-user");
    fake.seed("dungeon_maps", [raw]);
    const query = run(() => useDungeonMap("m1"));
    await flushPromises();
    expect(Object.keys(query.data.value?.layers.ground ?? {})).toHaveLength(2);
    expect(fake.rows("dungeon_maps")[0].layers).toEqual(raw.layers);
    expect(fake.calls.filter((call) => call.op === "update")).toEqual([]);
  });

  it("converts cell-only maps served from the persisted query cache", () => {
    const raw = savedRow("u1");
    const query = mountWith((client) => client.setQueryData(["dungeon_maps", "m1"], raw), () => useDungeonMap("m1"));
    expect(Object.values(query.data.value?.layers.ground ?? {}).map((region) => region.category)).toEqual(["floor", "terrainWater"]);
    expect(query.data.value?.layers.floor).toEqual(raw.layers.floor);
    expect(fake.calls).toEqual([]);
  });
});
