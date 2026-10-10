import { describe, it, expect, beforeEach, vi } from "vitest";
import type { LocationInsert } from "@/types/location.types";
import type { LocationMapRegionUpdate } from "@/types/locationMapRegion.types";

// #972: the bulk writers behind Publish to Atlas and Clone level. One request
// per call whatever the row count, the caller's user stamped on every row,
// column defaults kept (not nulled) on the three tables with defaults worth
// keeping, and the Supabase error thrown, never swallowed.

const mocks = vi.hoisted(() => ({
  queueEmbeddings: vi.fn(),
  failInsertAt: 0,
  inserts: [] as { table: string; rows: Record<string, unknown>[]; options?: unknown }[],
  rpcs: [] as { fn: string; args: unknown }[],
  existing: [] as { id: string; name: string }[],
  error: null as { message: string } | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (rows: Record<string, unknown>[], options?: unknown) => {
        mocks.inserts.push({ table, rows, options });
        return Promise.resolve({ error: mocks.inserts.length === mocks.failInsertAt ? { message: "level failed" } : mocks.error });
      },
      select: () => ({ eq: () => Promise.resolve({ data: mocks.existing, error: null }) }),
    }),
    rpc: (fn: string, args: unknown) => {
      mocks.rpcs.push({ fn, args });
      return Promise.resolve({ error: mocks.error });
    },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
  getCurrentUser: () => ({ id: "user-1" }),
}));
vi.mock("@/lib/queueEmbeddings", () => ({ queueEmbeddingsInBackground: mocks.queueEmbeddings }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: null }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({}) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));
vi.mock("@/lib/storage", () => ({ deleteByPublicUrl: vi.fn() }));
vi.mock("@/lib/reorder", () => ({ persistReorder: vi.fn(), toReorderEntries: vi.fn() }));
vi.mock("@/lib/populateSetting/settingContent", () => ({
  matchSettingRowIds: vi.fn(),
  stampSettingSource: vi.fn(),
  PLANAR_SOURCE: "planar",
}));
vi.mock("@/data/settingLocations", () => ({ PLANAR_LOCATIONS: [] }));

const { insertLocations, insertSettingLocations } = await import("@/composables/locations/useLocations");
const { insertLocationMapRegions, updateLocationMapRegions } = await import("@/composables/locations/useLocationMapRegions");
const { insertLocationDoors, updateLocationDoors } = await import("@/composables/locations/useLocationDoors");
const { insertLocationPlacements, updateLocationPlacements } = await import("@/composables/locations/useLocationPlacements");

describe("bulk location writers", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.rpcs.length = 0;
    mocks.existing = [];
    mocks.error = null;
    mocks.failInsertAt = 0;
    mocks.queueEmbeddings.mockClear();
  });

  it("insertLocations sends every room in one insert, with its minted id and the user", async () => {
    const rows = [{ id: "a", name: "A" }, { id: "b", name: "B" }] as (LocationInsert & { id: string })[];
    await insertLocations(rows);
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toMatchObject({ table: "locations" });
    expect(mocks.inserts[0]!.rows).toEqual([
      { id: "a", name: "A", user_id: "user-1" },
      { id: "b", name: "B", user_id: "user-1" },
    ]);
  });

  it("sends nothing for an empty set", async () => {
    await insertLocations([]);
    await insertLocationMapRegions([]);
    await insertLocationDoors([]);
    await insertLocationPlacements([]);
    await updateLocationMapRegions([]);
    await updateLocationDoors([]);
    await updateLocationPlacements([]);
    expect(mocks.inserts).toHaveLength(0);
    expect(mocks.rpcs).toHaveLength(0);
  });

  it("regions, doors and placements go one insert each and keep column defaults", async () => {
    await insertLocationMapRegions([
      { site_location_id: "s", space_location_id: "r1" },
      { site_location_id: "s", space_location_id: "r2", cells: ["0,0"] },
    ]);
    await insertLocationDoors([{ from_location_id: "r1", to_location_id: "r2" }]);
    await insertLocationPlacements([{ location_id: "r1", trap_id: "t" }, { location_id: "r2", dungeon_feature_id: "f" }]);

    expect(mocks.inserts.map((i) => i.table)).toEqual(["location_map_regions", "location_doors", "location_placements"]);
    for (const insert of mocks.inserts) {
      expect(insert.options).toEqual({ defaultToNull: false });
      expect(insert.rows.every((r) => r.user_id === "user-1")).toBe(true);
    }
    expect(mocks.inserts[0]!.rows).toHaveLength(2);
    expect(mocks.inserts[2]!.rows).toHaveLength(2);
  });

  it("updates every row with its own values in one request per table", async () => {
    const regions: { id: string; update: LocationMapRegionUpdate }[] = [
      { id: "g1", update: { cells: [] } },
      { id: "g2", update: { cells: ["1,1"] } },
    ];
    await updateLocationMapRegions(regions);
    await updateLocationDoors([{ id: "d1", update: { door_kind: "arch" } }]);
    await updateLocationPlacements([{ id: "p1", update: { location_id: "r2" } }]);
    expect(mocks.rpcs).toEqual([
      { fn: "update_location_map_regions", args: { p_updates: regions } },
      { fn: "update_location_doors", args: { p_updates: [{ id: "d1", update: { door_kind: "arch" } }] } },
      { fn: "update_location_placements", args: { p_updates: [{ id: "p1", update: { location_id: "r2" } }] } },
    ]);
  });

  it("seeds a setting's places one level per request, parents linked by minted id", async () => {
    mocks.existing = [{ id: "old-hells", name: "The Nine Hells" }];
    const inserted = await insertSettingLocations("c1", [
      { name: "The Nine Hells", location_type: "plane", notes: null, tags: [] },
      { name: "Avernus", location_type: "plane", parent: "The Nine Hells", notes: null, tags: [] },
      { name: "Outlands", location_type: "plane", notes: null, tags: [] },
      { name: "Sigil", location_type: "city", parent: "Outlands", notes: null, tags: [] },
      { name: "The Hive", location_type: "district", parent: "Sigil", notes: null, tags: [] },
    ], "planar");

    expect(inserted).toBe(4);
    expect(mocks.queueEmbeddings.mock.calls).toEqual(
      mocks.inserts.map(({ rows }) => ["location", rows.map((row) => row.id)]),
    );
    expect(mocks.inserts.map((i) => i.rows.map((r) => r.name))).toEqual([["Avernus", "Outlands"], ["Sigil"], ["The Hive"]]);
    const byName = new Map(mocks.inserts.flatMap((i) => i.rows).map((r) => [r.name, r]));
    expect(byName.get("Avernus")).toMatchObject({ parent_id: "old-hells", campaign_id: "c1", setting_source: "planar", user_id: "user-1" });
    expect(byName.get("Outlands")!.parent_id).toBeNull();
    expect(byName.get("Sigil")!.parent_id).toBe(byName.get("Outlands")!.id);
    expect(byName.get("The Hive")!.parent_id).toBe(byName.get("Sigil")!.id);
    expect(mocks.rpcs).toHaveLength(0);
  });

  it("queues embeddings for committed levels when a later insert fails", async () => {
    mocks.failInsertAt = 2;
    await expect(insertSettingLocations("c1", [
      { name: "Outlands", location_type: "plane", notes: null, tags: [] },
      { name: "Sigil", location_type: "city", parent: "Outlands", notes: null, tags: [] },
    ], "planar")).rejects.toMatchObject({ message: "level failed" });

    expect(mocks.inserts).toHaveLength(2);
    expect(mocks.queueEmbeddings.mock.calls).toEqual([
      ["location", [mocks.inserts[0]!.rows[0]!.id]],
    ]);
  });

  it("seeds nothing when every place is already there", async () => {
    mocks.existing = [{ id: "x", name: "Sigil" }];
    expect(await insertSettingLocations("c1", [{ name: "Sigil", location_type: "city", notes: null, tags: [] }], "planar")).toBe(0);
    expect(mocks.inserts).toHaveLength(0);
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    mocks.error = { message: "quota_exceeded" };
    await expect(insertLocations([{ id: "a" } as LocationInsert & { id: string }])).rejects.toMatchObject({ message: "quota_exceeded" });
    await expect(updateLocationDoors([{ id: "d", update: {} }])).rejects.toMatchObject({ message: "quota_exceeded" });
    await expect(insertSettingLocations("c1", [{ name: "Sigil", location_type: "city", notes: null, tags: [] }], "planar"))
      .rejects.toMatchObject({ message: "quota_exceeded" });
  });
});
