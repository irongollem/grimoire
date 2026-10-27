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
  snapshot: null as unknown,
  passes: [] as (string | undefined)[],
  omits: [] as (boolean | undefined)[],
  uploads: [] as (string | undefined)[],
  failStandUpload: false,
  emptyStandUpload: false,
  emptyLiveUpload: false,
  user: { id: "user-1" } as { id: string } | null,
  previous: { map_layer_url: "https://cdn/old.webp", map_layer_stand_url: "https://cdn/old-stand.webp", map_layer_stand_live_url: null as string | null },
  deleteNow: vi.fn(),
  deleteUnreferenced: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@/cartographer/bake", () => ({
  bakeMap: async (_m: unknown, _r: unknown, _d: unknown, options: { pass?: string; omitLive?: boolean }) => {
    mocks.passes.push(options.pass);
    mocks.omits.push(options.omitLive);
    return new Blob();
  },
  computeBakedDimensions: () => ({ cols: 4, rows: 4, originCellX: 0, originCellY: 0 }),
}));
const SNAPSHOT = { version: 2, darkness: "daylight", groups: [], lights: [], sprites: [], walls: [], doors: [], solid: [] };
const SWAYING = { ...SNAPSHOT, sprites: [{ url: "https://cdn/tree.webp", x: 1, y: 1, w: 1, h: 1, rotation: 0, sway: { amount: 3, speed: 1, phase: 0 } }] };
const LEAF = { url: "https://cdn/leaf.webp", hingeX: 0.25, hingeY: 0.5, openDegrees: 80 };
const DOORS = { ...SNAPSHOT, doors: [{ edge: "1,1:N", open: false, leaf: LEAF }, { edge: "2,1:W", open: true, leaf: null }] };
vi.mock("@/cartographer/mapLive", () => ({ buildMapLive: () => mocks.snapshot }));
vi.mock("@/lib/storage", () => ({
  deleteByPublicUrl: mocks.deleteNow,
  deleteUnreferencedByPublicUrl: mocks.deleteUnreferenced,
  uploadToBucket: async ({ path }: { path?: string }) => {
    mocks.uploads.push(path);
    if (mocks.failStandUpload && path?.endsWith("-stand.webp")) throw new Error("stand upload broke");
    if (mocks.emptyStandUpload && path?.endsWith("-stand.webp")) return null;
    if (mocks.emptyLiveUpload && path?.endsWith("-stand-live.webp")) return null;
    if (path?.endsWith("-stand-live.webp")) return "https://cdn/stand-live.webp";
    return path ? "https://cdn/stand.webp" : "https://cdn/x.webp";
  },
}));
vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => mocks.user }));
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
  useLocation: () => ({
    data: ref({
      id: "site-1",
      location_type: "dungeon",
      campaign_id: "camp-1",
      ...mocks.previous,
    }),
  }),
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

// An own trap id is a uuid; anything else reads as a library slug.
const TRAP_UUID = "5b0e2f0e-8f7d-4d57-9a53-1d6f3a8f2c11";
const space = (key: string) => ({ key, cells: [`${key},0`], signature: `sig-${key}`, nameSource: null });
const region = (id: string, spaceId: string) => ({ id, space_location_id: spaceId });

function setup() {
  const publisher = useMapPublish({
    map: () => ({ id: "map-1", rev: 7 }) as unknown as DungeonMap,
    runtimes: () => new Map(), dressing: () => new Map(), loadDressing: async () => new Map(),
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
    mocks.passes.length = 0;
    mocks.omits.length = 0;
    mocks.snapshot = SNAPSHOT;
    mocks.uploads.length = 0;
    mocks.failStandUpload = false;
    mocks.emptyStandUpload = false;
    mocks.user = { id: "user-1" };
    mocks.previous = { map_layer_url: "https://cdn/old.webp", map_layer_stand_url: "https://cdn/old-stand.webp", map_layer_stand_live_url: null };
    mocks.deleteNow.mockResolvedValue(undefined);
    mocks.deleteUnreferenced.mockResolvedValue(undefined);
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
          target: { kind: "trap", id: TRAP_UUID },
          spaceRef: { kind: "created", spaceKey: "s:a" },
        },
        { kind: "reanchor", placement: { id: "pl-1", source_cell_key: "9,9" }, spaceRef: { kind: "existing", spaceId: "room-c" } },
      ],
      summary: {},
    } as unknown as PublishPlan;
  });

  it("writes the live snapshot with the Drawing (#1073)", async () => {
    const { publish } = setup();
    await publish();
    expect(mocks.updateDrawing.mock.calls[0]![0]).toMatchObject({ mapLive: SNAPSHOT });
  });

  it("bakes the ground and the standing half and writes both urls", async () => {
    const { publish } = setup();
    await publish();
    expect(mocks.passes).toEqual(["ground", "standing"]);
    expect(mocks.uploads[1]).toMatch(/^user-1\/.+-stand\.webp$/);
    expect(mocks.updateDrawing.mock.calls[0]![0]).toMatchObject({
      mapLayerUrl: "https://cdn/x.webp",
      mapLayerStandUrl: "https://cdn/stand.webp",
      mapLayerStandLiveUrl: null,
    });
  });

  it("bakes a third image without the swaying props when the snapshot has sprites", async () => {
    mocks.snapshot = SWAYING;
    const { publish } = setup();
    await publish();
    expect(mocks.passes).toEqual(["ground", "standing", "standing"]);
    expect(mocks.omits).toEqual([undefined, undefined, true]);
    expect(mocks.uploads[2]).toMatch(/^user-1\/.+-stand-live\.webp$/);
    expect(mocks.updateDrawing.mock.calls[0]![0]).toMatchObject({
      mapLayerStandUrl: "https://cdn/stand.webp",
      mapLayerStandLiveUrl: "https://cdn/stand-live.webp",
    });
  });

  it("bakes the third image for a snapshot with only a door leaf, and not for doors with no art", async () => {
    mocks.snapshot = { ...DOORS, doors: [{ edge: "2,1:W", open: true, leaf: null }] };
    await setup().publish();
    expect(mocks.passes).toEqual(["ground", "standing"]);
    mocks.passes.length = 0;
    mocks.omits.length = 0;
    mocks.snapshot = DOORS;
    await setup().publish();
    expect(mocks.passes).toEqual(["ground", "standing", "standing"]);
    expect(mocks.omits).toEqual([undefined, undefined, true]);
  });

  it("removes the images the publish replaced once the site points at the new ones, unless still referenced", async () => {
    const { publish } = setup();
    await publish();
    expect(mocks.deleteUnreferenced).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUnreferenced).toHaveBeenCalledWith({ urls: ["https://cdn/old.webp", "https://cdn/old-stand.webp"] });
    expect(mocks.deleteNow).not.toHaveBeenCalled();
  });

  it("a failed upload removes the ones that landed, writes nothing and reports the error", async () => {
    mocks.failStandUpload = true;
    const { publish, review } = setup();
    await publish();
    expect(mocks.deleteNow).toHaveBeenCalledWith("https://cdn/x.webp", null, null);
    expect(mocks.updateDrawing).not.toHaveBeenCalled();
    expect(mocks.deleteUnreferenced).not.toHaveBeenCalled();
    expect(review.value.error).toBe("stand upload broke");
  });

  it("a failed Drawing write offers the new images for removal and keeps the old ones", async () => {
    mocks.updateDrawing.mockRejectedValueOnce({ message: "drawing broke" });
    const { publish, review } = setup();
    await publish();
    expect(mocks.deleteUnreferenced).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUnreferenced).toHaveBeenCalledWith({ urls: ["https://cdn/x.webp", "https://cdn/stand.webp", null] });
    expect(review.value.error).toBe("drawing broke");
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
    expect(placements).toEqual([expect.objectContaining({ location_id: hall, trap_id: TRAP_UUID })]);
  });

  it("writes a library trap or feature into its library column, not the uuid one", async () => {
    mocks.plan = {
      spaces: [{ kind: "bind", space: space("s:c"), spaceId: "room-c" }],
      ways: [],
      placements: [
        { kind: "create", link: { cellKey: "0,0" }, target: { kind: "trap", id: "grimoire_hidden_pit" }, spaceRef: { kind: "existing", spaceId: "room-c" } },
        { kind: "create", link: { cellKey: "1,0" }, target: { kind: "dungeon_feature", id: "grimoire_altar" }, spaceRef: { kind: "existing", spaceId: "room-c" } },
      ],
      summary: {},
    } as unknown as PublishPlan;
    const { publish } = setup();
    await publish();

    expect(mocks.insertPlacements.mock.calls[0]![0]).toEqual([
      { location_id: "room-c", library_trap_id: "grimoire_hidden_pit", source_cell_key: "0,0" },
      { location_id: "room-c", library_dungeon_feature_id: "grimoire_altar", source_cell_key: "1,0" },
    ]);
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

describe("useMapPublish.publish guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshot = SNAPSHOT;
    mocks.uploads.length = 0;
    mocks.failStandUpload = false;
    mocks.emptyStandUpload = false;
    mocks.emptyLiveUpload = false;
    mocks.user = { id: "user-1" };
    mocks.previous = { map_layer_url: "https://cdn/old.webp", map_layer_stand_url: "https://cdn/old-stand.webp", map_layer_stand_live_url: null };
    mocks.deleteNow.mockResolvedValue(undefined);
    mocks.deleteUnreferenced.mockResolvedValue(undefined);
    for (const m of [mocks.updateDrawing, mocks.insertLocations, mocks.insertRegions, mocks.updateRegions, mocks.reconcile, mocks.insertDoors, mocks.updateDoors, mocks.insertPlacements, mocks.updatePlacements, mocks.updateLocation]) {
      m.mockResolvedValue(undefined);
    }
    mocks.plan = {
      spaces: [{ kind: "update", space: space("s:d"), region: region("reg-d", "room-d"), before: 1, after: 2, reason: "shape" }],
      ways: [], placements: [], summary: {},
    } as unknown as PublishPlan;
  });

  it("a second click while a publish is running writes nothing more", async () => {
    let release!: () => void;
    mocks.updateDrawing.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const { publish } = setup();
    const first = publish();
    await vi.waitFor(() => expect(mocks.updateDrawing).toHaveBeenCalledTimes(1));
    await publish();
    release();
    await first;
    expect(mocks.updateDrawing).toHaveBeenCalledTimes(1);
    expect(mocks.updateLocation).toHaveBeenCalledTimes(1);
  });

  it("publishes nothing without a target site", async () => {
    const publisher = setup();
    publisher.targetSiteId.value = "";
    await publisher.publish();
    expect(mocks.uploads).toEqual([]);
    expect(mocks.updateDrawing).not.toHaveBeenCalled();
  });

  it("publishes nothing for no one signed in, and does not refresh a site it never touched", async () => {
    mocks.user = null;
    const { publish, review } = setup();
    await publish();
    expect(review.value.error).toBe("Not authenticated");
    expect(mocks.updateDrawing).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("an upload that comes back without a url is treated as failed: what landed is removed and the site is untouched", async () => {
    mocks.emptyStandUpload = true;
    const { publish, review } = setup();
    await publish();
    expect(review.value.error).toBe("Upload failed");
    expect(mocks.deleteNow).toHaveBeenCalledTimes(1);
    expect(mocks.updateDrawing).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("treats a missing third image as a failed publish when the snapshot needs one", async () => {
    mocks.snapshot = SWAYING;
    mocks.emptyLiveUpload = true;
    const { publish, review } = setup();
    await publish();
    expect(review.value.error).toBe("Upload failed");
    expect(mocks.updateDrawing).not.toHaveBeenCalled();
  });

  it("a reshaped room alone is enough to reconcile the doors", async () => {
    const { publish } = setup();
    await publish();
    expect(mocks.updateRegions).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });

  it("never offers an image for removal that the publish has just uploaded", async () => {
    // The site already points at the picture a re-publish produces (the bake is byte-identical), so the new ground url is also the "old" one.
    mocks.previous = { map_layer_url: "https://cdn/x.webp", map_layer_stand_url: "https://cdn/old-stand.webp", map_layer_stand_live_url: null };
    const { publish } = setup();
    await publish();
    const offered = mocks.deleteUnreferenced.mock.calls.flatMap(([arg]) => (arg as { urls: (string | null)[] }).urls);
    expect(offered).toEqual(["https://cdn/old-stand.webp"]);
  });
});

describe("useMapPublish review before the editor mounts", () => {
  it("asks for no structure while there is no map yet, and reviews nothing", () => {
    // The Cartographer's header reads the review while the page renders, before the editor below it mounts, and its
    // `map` answers null until then: the review must not reach for the editor's structure in that gap.
    const structure = vi.fn(() => ({}) as unknown as DerivedStructure);
    const publisher = useMapPublish({
      map: () => null,
      runtimes: () => new Map(), dressing: () => new Map(), loadDressing: async () => new Map(),
      glyphs: () => ({}),
      structure,
    });
    publisher.targetSiteId.value = "site-1";
    expect(publisher.review.value.plan).toBeNull();
    expect(publisher.review.value.bakedDims).toBeNull();
    expect(structure).not.toHaveBeenCalled();
  });
});
