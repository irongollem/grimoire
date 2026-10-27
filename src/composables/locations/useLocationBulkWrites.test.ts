import { describe, it, expect, beforeEach, vi } from "vitest";
import type { LocationInsert } from "@/types/location.types";
import type { LocationMapRegionUpdate } from "@/types/locationMapRegion.types";

// #972: the bulk writers behind Publish to Atlas and Clone level. One request
// per call whatever the row count, the caller's user stamped on every row,
// column defaults kept (not nulled) on the three tables with defaults worth
// keeping, and the Supabase error thrown, never swallowed.

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ queueEmbeddings: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: fake.client,
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

/** Stand in for an `update_*` rpc: apply each `{ id, update }` to its table. */
function registerBulkUpdate(rpc: string, table: string) {
  fake.onRpc(rpc, async (args) => {
    for (const { id, update } of args.p_updates as { id: string; update: Record<string, unknown> }[]) {
      await fake.client.from(table).update(update).eq("id", id);
    }
  });
}

const requests = () => fake.calls.filter((call) => call.op !== "select");

describe("bulk location writers", () => {
  beforeEach(() => {
    fake.reset();
    mocks.queueEmbeddings.mockClear();
  });

  it("insertLocations stores every room with its minted id and the user, in one insert", async () => {
    const rows = [{ id: "a", name: "A" }, { id: "b", name: "B" }] as (LocationInsert & { id: string })[];
    await insertLocations(rows);
    expect(fake.rows("locations")).toEqual([
      { id: "a", name: "A", user_id: "user-1" },
      { id: "b", name: "B", user_id: "user-1" },
    ]);
    expect(requests()).toHaveLength(1);
  });

  it("sends nothing for an empty set", async () => {
    await insertLocations([]);
    await insertLocationMapRegions([]);
    await insertLocationDoors([]);
    await insertLocationPlacements([]);
    await updateLocationMapRegions([]);
    await updateLocationDoors([]);
    await updateLocationPlacements([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("regions, doors and placements go one insert each, stamped with the user, keeping column defaults", async () => {
    await insertLocationMapRegions([
      { site_location_id: "s", space_location_id: "r1" },
      { site_location_id: "s", space_location_id: "r2", cells: ["0,0"] },
    ]);
    await insertLocationDoors([{ from_location_id: "r1", to_location_id: "r2" }]);
    await insertLocationPlacements([{ location_id: "r1", trap_id: "t" }, { location_id: "r2", dungeon_feature_id: "f" }]);

    expect(fake.rows("location_map_regions").map((r) => r.user_id)).toEqual(["user-1", "user-1"]);
    expect(fake.rows("location_doors").map((r) => r.user_id)).toEqual(["user-1"]);
    expect(fake.rows("location_placements").map((r) => r.user_id)).toEqual(["user-1", "user-1"]);
    // Rows with different keys must not be padded with explicit nulls (they would overwrite column defaults),
    // so the request itself is the property here.
    expect(requests().map((call) => [call.op, call.options])).toEqual([
      ["insert", { defaultToNull: false }],
      ["insert", { defaultToNull: false }],
      ["insert", { defaultToNull: false }],
    ]);
  });

  it("updates every row with its own values", async () => {
    registerBulkUpdate("update_location_map_regions", "location_map_regions");
    registerBulkUpdate("update_location_doors", "location_doors");
    registerBulkUpdate("update_location_placements", "location_placements");
    fake.seed("location_map_regions", [{ id: "g1", cells: ["9,9"] }, { id: "g2", cells: ["9,9"] }]);
    fake.seed("location_doors", [{ id: "d1", door_kind: "door" }]);
    fake.seed("location_placements", [{ id: "p1", location_id: "r1" }]);

    const regions: { id: string; update: LocationMapRegionUpdate }[] = [
      { id: "g1", update: { cells: [] } },
      { id: "g2", update: { cells: ["1,1"] } },
    ];
    await updateLocationMapRegions(regions);
    await updateLocationDoors([{ id: "d1", update: { door_kind: "arch" } }]);
    await updateLocationPlacements([{ id: "p1", update: { location_id: "r2" } }]);

    expect(fake.rows("location_map_regions").map((r) => r.cells)).toEqual([[], ["1,1"]]);
    expect(fake.rows("location_doors")).toEqual([{ id: "d1", door_kind: "arch" }]);
    expect(fake.rows("location_placements")).toEqual([{ id: "p1", location_id: "r2" }]);
    // All or nothing: one request per table, however many rows.
    expect(fake.calls.filter((call) => call.kind === "rpc")).toHaveLength(3);
  });

  it("seeds a setting's places one level per request, parents linked by minted id", async () => {
    fake.seed("locations", [
      { id: "old-hells", name: "The Nine Hells", campaign_id: "c1" },
      // Another campaign's Sigil must not make this campaign skip its own.
      { id: "foreign-sigil", name: "Sigil", campaign_id: "c2" },
    ]);
    const inserted = await insertSettingLocations("c1", [
      { name: "The Nine Hells", location_type: "plane", notes: null, tags: [] },
      { name: "Avernus", location_type: "plane", parent: "The Nine Hells", notes: null, tags: [] },
      { name: "Outlands", location_type: "plane", notes: null, tags: [] },
      { name: "Sigil", location_type: "city", parent: "Outlands", notes: null, tags: [] },
      { name: "The Hive", location_type: "district", parent: "Sigil", notes: null, tags: [] },
    ], "planar");

    expect(inserted).toBe(4);
    const added = fake.rows("locations").slice(2);
    expect(added.map((r) => r.name)).toEqual(["Avernus", "Outlands", "Sigil", "The Hive"]);
    const byName = new Map(added.map((r) => [r.name, r]));
    expect(byName.get("Avernus")).toMatchObject({ parent_id: "old-hells", campaign_id: "c1", setting_source: "planar", user_id: "user-1" });
    expect(byName.get("Outlands")!.parent_id).toBeNull();
    expect(byName.get("Sigil")!.parent_id).toBe(byName.get("Outlands")!.id);
    expect(byName.get("The Hive")!.parent_id).toBe(byName.get("Sigil")!.id);
    // Avernus and Outlands share a level; Sigil waits for Outlands, The Hive for Sigil.
    expect(requests().map((call) => (call.payload as unknown[]).length)).toEqual([2, 1, 1]);
    // Column defaults survive here too (places of different shapes share a request).
    expect(requests().map((call) => call.options)).toEqual(Array(3).fill({ defaultToNull: false }));
    // Embeddings are queued per committed level.
    expect(mocks.queueEmbeddings.mock.calls).toEqual([
      ["location", [byName.get("Avernus")!.id, byName.get("Outlands")!.id]],
      ["location", [byName.get("Sigil")!.id]],
      ["location", [byName.get("The Hive")!.id]],
    ]);
  });

  it("queues embeddings for committed levels when a later insert fails", async () => {
    // The first call to `locations` is the existing-places read; let it and level one through.
    fake.failNext("locations", { message: "level failed" }, { after: 2 });
    await expect(insertSettingLocations("c1", [
      { name: "Outlands", location_type: "plane", notes: null, tags: [] },
      { name: "Sigil", location_type: "city", parent: "Outlands", notes: null, tags: [] },
    ], "planar")).rejects.toMatchObject({ message: "level failed" });

    const [outlands] = fake.rows("locations");
    expect(fake.rows("locations").map((r) => r.name)).toEqual(["Outlands"]);
    expect(mocks.queueEmbeddings.mock.calls).toEqual([["location", [outlands!.id]]]);
  });

  it("seeds nothing when every place is already there", async () => {
    fake.seed("locations", [{ id: "x", name: "Sigil", campaign_id: "c1" }]);
    expect(await insertSettingLocations("c1", [{ name: "Sigil", location_type: "city", notes: null, tags: [] }], "planar")).toBe(0);
    expect(fake.rows("locations")).toHaveLength(1);
  });

  it("throws the Supabase error instead of swallowing it", async () => {
    fake.failNext("locations", { message: "quota_exceeded" });
    await expect(insertLocations([{ id: "a" } as LocationInsert & { id: string }])).rejects.toMatchObject({ message: "quota_exceeded" });
    fake.failNext("update_location_doors", { message: "quota_exceeded" });
    await expect(updateLocationDoors([{ id: "d", update: {} }])).rejects.toMatchObject({ message: "quota_exceeded" });
    fake.failNext("locations", { message: "quota_exceeded" });
    await expect(insertSettingLocations("c1", [{ name: "Sigil", location_type: "city", notes: null, tags: [] }], "planar"))
      .rejects.toMatchObject({ message: "quota_exceeded" });
  });
});
