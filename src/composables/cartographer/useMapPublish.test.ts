import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { DungeonMap } from "@/types/dungeonMap.types";
import type { DerivedStructure } from "@/cartographer/structure.types";
import type { PublishPlan } from "@/lib/locations/publish";

// #972: Publish to Atlas writes a table at a time. These tests pin the request
// shape for a plan that creates, binds, reshapes and orphans spaces and adds
// ways and placements: one insert per table, the door reconcile once, one
// batched embed, one refresh. The call order is recorded so the table order
// (rooms, regions, doors, placements, then the rev claim) cannot drift, which
// matters because the database guards look each parent up.

const mocks = vi.hoisted(() => ({
  plan: null as unknown as PublishPlan,
  order: [] as string[],
  insertLocations: vi.fn(),
  insertRegions: vi.fn(),
  updateRegions: vi.fn(),
  insertDoors: vi.fn(),
  updateDoors: vi.fn(),
  insertPlacements: vi.fn(),
  updatePlacements: vi.fn(),
  reconcile: vi.fn(),
  embed: vi.fn(),
  invalidate: vi.fn(),
  updateDrawing: vi.fn(),
  updateLocation: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@/cartographer/bake", () => ({
  bakeMap: async () => new Blob(),
  computeBakedDimensions: () => ({ cols: 4, rows: 4, originCellX: 0, originCellY: 0 }),
}));
vi.mock("@/lib/storage", () => ({ uploadToBucket: async () => "https://cdn/x.webp" }));
vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => ({ id: "user-1" }) }));
vi.mock("@/lib/queueEmbeddings", () => ({ queueEmbeddingsInBackground: mocks.embed }));
vi.mock("@/lib/locations/publish", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/locations/publish")>()),
  planPublish: () => mocks.plan,
}));
vi.mock("@/composables/cartographer/usePublishedSites", () => ({ usePublishedSites: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useSitePlacements", () => ({ useSitePlacements: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: ref([]) }),
  useLocations: () => ({ data: ref([]) }),
  useLocation: () => ({ data: ref({ id: "site-1", location_type: "dungeon", campaign_id: "camp-1" }) }),
  useUpdateLocation: () => ({ mutateAsync: mocks.updateLocation }),
  useUpdateLocationDrawing: () => ({ mutateAsync: mocks.updateDrawing }),
  insertLocations: mocks.insertLocations,
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  useLocationMapRegions: () => ({ data: ref([]) }),
  insertLocationMapRegions: mocks.insertRegions,
  updateLocationMapRegions: mocks.updateRegions,
  reconcileSiteDoorEndpoints: mocks.reconcile,
}));
vi.mock("@/composables/locations/useLocationDoors", () => ({
  insertLocationDoors: mocks.insertDoors,
  updateLocationDoors: mocks.updateDoors,
}));
vi.mock("@/composables/locations/useLocationPlacements", () => ({
  insertLocationPlacements: mocks.insertPlacements,
  updateLocationPlacements: mocks.updatePlacements,
}));

const { useMapPublish } = await import("@/composables/cartographer/useMapPublish");

const space = (key: string) => ({ key, cells: [`${key},0`], signature: `sig-${key}`, nameSource: null });
const region = (id: string, spaceId: string) => ({ id, space_location_id: spaceId });

function setup() {
  const publisher = useMapPublish({
    map: () => ({ id: "map-1", rev: 7 }) as unknown as DungeonMap,
    runtimes: () => new Map(),
    glyphs: () => ({}),
    structure: () => ({}) as unknown as DerivedStructure,
  });
  publisher.targetSiteId.value = "site-1";
  return publisher;
}

describe("useMapPublish.publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
    const record = (name: string) => async () => void mocks.order.push(name);
    mocks.updateDrawing.mockImplementation(record("drawing"));
    mocks.insertLocations.mockImplementation(record("rooms"));
    mocks.insertRegions.mockImplementation(record("regions"));
    mocks.updateRegions.mockImplementation(record("regions:update"));
    mocks.reconcile.mockImplementation(record("reconcile"));
    mocks.insertDoors.mockImplementation(record("doors"));
    mocks.updateDoors.mockImplementation(record("doors:update"));
    mocks.insertPlacements.mockImplementation(record("placements"));
    mocks.updatePlacements.mockImplementation(record("placements:update"));
    mocks.updateLocation.mockImplementation(record("rev"));
    mocks.plan = {
      spaces: [
        { kind: "create", space: space("s:a"), proposedName: "Hall" },
        { kind: "create", space: space("s:b"), proposedName: "Cellar" },
        { kind: "bind", space: space("s:c"), spaceId: "room-c" },
        { kind: "update", space: space("s:d"), region: region("reg-d", "room-d"), before: 1, after: 2, reason: "shape" },
        { kind: "skip", space: space("s:e"), region: region("reg-e", "room-e") },
        { kind: "orphan", region: region("reg-o", "room-o") },
      ],
      ways: [
        { kind: "create", way: { kind: "door", edgeKey: "0,0:N" }, fromSpaceId: "created:s:a", toSpaceId: "created:s:b" },
        { kind: "create", way: { kind: "arch", edgeKey: "1,0:N" }, fromSpaceId: "created:s:b", toSpaceId: "room-c" },
        { kind: "update", way: { kind: "arch", edgeKey: "2,0:N" }, door: { id: "door-1" }, before: "door", after: "arch" },
      ],
      placements: [
        {
          kind: "create",
          link: { cellKey: "0,0" },
          target: { kind: "trap", id: "trap-1" },
          spaceRef: { kind: "created", spaceKey: "s:a" },
        },
        { kind: "reanchor", placement: { id: "pl-1", source_cell_key: "9,9" }, spaceRef: { kind: "existing", spaceId: "room-c" } },
      ],
      summary: {},
    } as unknown as PublishPlan;
  });

  it("writes one request per table, in table order, and the rev claim last", async () => {
    const { publish } = setup();
    await publish();

    for (const fn of [mocks.insertLocations, mocks.insertRegions, mocks.updateRegions, mocks.insertDoors, mocks.updateDoors, mocks.insertPlacements, mocks.updatePlacements]) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
    // Inserts and updates of one table run side by side, so only the order
    // between tables is pinned.
    const tableOf = (step: string) => step.replace(":update", "");
    const tables = mocks.order.map(tableOf).filter((t, i, all) => all.indexOf(t) === i);
    expect(tables).toEqual(["drawing", "rooms", "regions", "reconcile", "doors", "placements", "rev"]);
  });

  it("mints each created room's id once and uses it for the region, way and placement", async () => {
    const { publish } = setup();
    await publish();

    const rooms = mocks.insertLocations.mock.calls[0]![0] as { id: string; name: string; parent_id: string; campaign_id: string }[];
    expect(rooms.map((r) => r.name)).toEqual(["Hall", "Cellar"]);
    expect(rooms.every((r) => r.parent_id === "site-1" && r.campaign_id === "camp-1")).toBe(true);
    const [hall, cellar] = rooms.map((r) => r.id);

    const regions = mocks.insertRegions.mock.calls[0]![0] as { space_location_id: string }[];
    expect(regions.map((r) => r.space_location_id)).toEqual([hall, cellar, "room-c"]);

    const doors = mocks.insertDoors.mock.calls[0]![0] as { from_location_id: string; to_location_id: string }[];
    expect(doors).toEqual([
      expect.objectContaining({ from_location_id: hall, to_location_id: cellar }),
      expect.objectContaining({ from_location_id: cellar, to_location_id: "room-c" }),
    ]);

    const placements = mocks.insertPlacements.mock.calls[0]![0] as { location_id: string; trap_id: string }[];
    expect(placements).toEqual([expect.objectContaining({ location_id: hall, trap_id: "trap-1" })]);
  });

  it("batches updates without hooks: orphan and reshape, door kind, re-anchor", async () => {
    const { publish } = setup();
    await publish();

    expect(mocks.updateRegions.mock.calls[0]![0]).toEqual([
      { id: "reg-d", update: { cells: ["s:d,0"], cell_signature: "sig-s:d" } },
      { id: "reg-o", update: { cells: [], cell_signature: null } },
    ]);
    expect(mocks.updateDoors.mock.calls[0]![0]).toEqual([
      { id: "door-1", update: { door_kind: "arch", derived_from: "publish" } },
    ]);
    expect(mocks.updatePlacements.mock.calls[0]![0]).toEqual([
      { id: "pl-1", update: { location_id: "room-c", source_cell_key: "9,9" } },
    ]);
  });

  it("reconciles door endpoints once, embeds the new rooms once, and refreshes once", async () => {
    const { publish, open } = setup();
    open.value = true;
    await publish();
    await nextTick();

    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledWith("site-1");
    const rooms = mocks.insertLocations.mock.calls[0]![0] as { id: string }[];
    expect(mocks.embed).toHaveBeenCalledTimes(1);
    expect(mocks.embed).toHaveBeenCalledWith("location", rooms.map((r) => r.id));
    expect(mocks.invalidate).toHaveBeenCalledTimes(6);
    expect(open.value).toBe(false);
  });

  it("skips the reconcile when no region was written", async () => {
    mocks.plan = { spaces: [{ kind: "skip", space: space("s:e"), region: region("reg-e", "room-e") }], ways: [], placements: [], summary: {} } as unknown as PublishPlan;
    const { publish } = setup();
    await publish();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.insertLocations).toHaveBeenCalledTimes(1);
    expect(mocks.embed).toHaveBeenCalledWith("location", []);
  });

  it("a failed table write stops there, claims no rev, reports the error and still refreshes", async () => {
    mocks.insertDoors.mockRejectedValueOnce({ message: "doors broke" });
    const { publish, review } = setup();
    await publish();

    expect(mocks.insertPlacements).not.toHaveBeenCalled();
    expect(mocks.updateLocation).not.toHaveBeenCalled();
    expect(review.value.error).toBe("doors broke");
    expect(review.value.publishing).toBe(false);
    expect(mocks.invalidate).toHaveBeenCalledTimes(6);
  });

  it("a quota rejection on the rooms is reported as the paywall, not an error string", async () => {
    mocks.insertLocations.mockRejectedValueOnce({ message: "quota_exceeded" });
    const { publish, review } = setup();
    await publish();

    expect(review.value.quotaExceeded).toBe(true);
    expect(review.value.error).toBeNull();
    expect(mocks.insertRegions).not.toHaveBeenCalled();
  });
});
