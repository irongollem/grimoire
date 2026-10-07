import { describe, it, expect, beforeEach, vi } from "vitest";
import type { LocationInsert } from "@/types/location.types";

// #972: the bulk writers behind Publish to Atlas and Clone level. One request
// per call whatever the row count, the caller's user stamped on every row,
// column defaults kept (not nulled) on the three tables with defaults worth
// keeping, and the Supabase error thrown, never swallowed.

const mocks = vi.hoisted(() => ({
  inserts: [] as { table: string; rows: Record<string, unknown>[]; options?: unknown }[],
  updates: [] as { table: string; update: unknown; id: unknown }[],
  error: null as { message: string } | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (rows: Record<string, unknown>[], options?: unknown) => {
        mocks.inserts.push({ table, rows, options });
        return Promise.resolve({ error: mocks.error });
      },
      update: (update: unknown) => ({
        eq: (_col: string, id: unknown) => {
          mocks.updates.push({ table, update, id });
          return Promise.resolve({ error: mocks.error });
        },
      }),
    }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
  getCurrentUser: () => ({ id: "user-1" }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: null }) }));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({}) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));
vi.mock("@/lib/storage", () => ({ deleteByPublicUrl: vi.fn() }));
vi.mock("@/lib/reorder", () => ({ persistReorder: vi.fn(), toReorderEntries: vi.fn() }));
vi.mock("@/lib/populateSetting/settingContent", () => ({
  matchSettingRowIds: vi.fn(),
  stampSettingSource: vi.fn(),
  PLANAR_SOURCE: "planar",
}));
vi.mock("@/data/settingLocations", () => ({ PLANAR_LOCATIONS: [] }));

const { insertLocations } = await import("@/composables/locations/useLocations");
const { insertLocationMapRegions, updateLocationMapRegions } = await import("@/composables/locations/useLocationMapRegions");
const { insertLocationDoors, updateLocationDoors } = await import("@/composables/locations/useLocationDoors");
const { insertLocationPlacements, updateLocationPlacements } = await import("@/composables/locations/useLocationPlacements");

describe("bulk location writers", () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.updates.length = 0;
    mocks.error = null;
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
    expect(mocks.inserts).toHaveLength(0);
    expect(mocks.updates).toHaveLength(0);
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

  it("updates each row once with its own values", async () => {
    await updateLocationMapRegions([{ id: "g1", update: { cells: [] } }, { id: "g2", update: { cells: ["1,1"] } }]);
    await updateLocationDoors([{ id: "d1", update: { door_kind: "arch" } }]);
    await updateLocationPlacements([{ id: "p1", update: { location_id: "r2" } }]);
    expect(mocks.updates).toEqual([
      { table: "location_map_regions", update: { cells: [] }, id: "g1" },
      { table: "location_map_regions", update: { cells: ["1,1"] }, id: "g2" },
      { table: "location_doors", update: { door_kind: "arch" }, id: "d1" },
      { table: "location_placements", update: { location_id: "r2" }, id: "p1" },
    ]);
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    mocks.error = { message: "quota_exceeded" };
    await expect(insertLocations([{ id: "a" } as LocationInsert & { id: string }])).rejects.toMatchObject({ message: "quota_exceeded" });
    await expect(updateLocationDoors([{ id: "d", update: {} }])).rejects.toMatchObject({ message: "quota_exceeded" });
  });
});
