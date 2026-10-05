import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CloneLevelPlan, CloneLevelSource } from "@/lib/locations/cloneLevel";
import type { LocationInsert } from "@/types/location.types";

// #972: a level clone writes a table at a time. These tests pin the request
// shape: the site once, then ONE insert each for rooms, regions and doors,
// every row naming the ids minted for the new rooms, one batched embed and
// one refresh.

const mocks = vi.hoisted(() => ({
  plan: null as unknown as CloneLevelPlan,
  order: [] as string[],
  insertLocations: vi.fn(),
  insertRegions: vi.fn(),
  insertDoors: vi.fn(),
  createSite: vi.fn(),
  embed: vi.fn(),
  invalidate: vi.fn(),
  push: vi.fn(),
}));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@/lib/locations/cloneLevel", () => ({ planCloneLevel: () => mocks.plan }));
vi.mock("@/lib/queueEmbeddings", () => ({ queueEmbeddingsInBackground: mocks.embed }));
vi.mock("@/composables/locations/useLocations", () => ({
  useCreateLocation: () => ({ mutateAsync: mocks.createSite }),
  insertLocations: mocks.insertLocations,
}));
vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  insertLocationMapRegions: mocks.insertRegions,
}));
vi.mock("@/composables/locations/useLocationDoors", () => ({
  insertLocationDoors: mocks.insertDoors,
}));

const { useCloneSiteLevel } = await import("@/composables/locations/useCloneSiteLevel");

const roomInsert = (name: string) => ({ name }) as unknown as Omit<LocationInsert, "parent_id">;

describe("useCloneSiteLevel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSite.mockImplementation(async () => {
      mocks.order.push("site");
      return { id: "new-site" };
    });
    mocks.insertLocations.mockImplementation(async () => void mocks.order.push("rooms"));
    mocks.insertRegions.mockImplementation(async () => void mocks.order.push("regions"));
    mocks.insertDoors.mockImplementation(async () => void mocks.order.push("doors"));
    mocks.order.length = 0;
    mocks.plan = {
      siteInsert: { name: "Keep (copy)" } as LocationInsert,
      rooms: [
        { sourceId: "r1", insert: roomInsert("Hall") },
        { sourceId: "r2", insert: roomInsert("Cellar") },
        { sourceId: "r3", insert: roomInsert("Vault") },
      ],
      regions: [
        { spaceSourceId: "r1", insert: { cells: ["0,0"], cell_signature: null } },
        { spaceSourceId: null, insert: { cells: ["5,5"], cell_signature: null } },
      ],
      doors: [
        { fromSourceId: "r1", toSourceId: "r2", insert: { door_kind: "door", edge_key: null, dungeon_feature_id: null } },
        { fromSourceId: "r2", toSourceId: "missing", insert: { door_kind: "door", edge_key: null, dungeon_feature_id: null } },
      ],
    } as CloneLevelPlan;
  });

  it("writes the site, then rooms, regions and doors in one request each", async () => {
    const { cloneLevel } = useCloneSiteLevel();
    await cloneLevel({} as CloneLevelSource);

    expect(mocks.order).toEqual(["site", "rooms", "regions", "doors"]);
    expect(mocks.createSite).toHaveBeenCalledTimes(1);
    expect(mocks.insertLocations).toHaveBeenCalledTimes(1);
    expect(mocks.insertRegions).toHaveBeenCalledTimes(1);
    expect(mocks.insertDoors).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/locations?at=new-site");
  });

  it("mints the room ids and resolves every region and door against them", async () => {
    const { cloneLevel } = useCloneSiteLevel();
    await cloneLevel({} as CloneLevelSource);

    const rooms = mocks.insertLocations.mock.calls[0]![0] as (LocationInsert & { id: string })[];
    expect(rooms).toHaveLength(3);
    expect(new Set(rooms.map((r) => r.id)).size).toBe(3);
    expect(rooms.every((r) => r.parent_id === "new-site")).toBe(true);

    const regions = mocks.insertRegions.mock.calls[0]![0] as { space_location_id: string | null; site_location_id: string }[];
    expect(regions.map((r) => r.space_location_id)).toEqual([rooms[0]!.id, null]);
    expect(regions.every((r) => r.site_location_id === "new-site")).toBe(true);

    // The door whose far end is not a cloned room is skipped, not sent.
    const doors = mocks.insertDoors.mock.calls[0]![0] as { from_location_id: string; to_location_id: string }[];
    expect(doors).toEqual([expect.objectContaining({ from_location_id: rooms[0]!.id, to_location_id: rooms[1]!.id })]);
  });

  it("embeds the new rooms in one batched call and refreshes once", async () => {
    const { cloneLevel } = useCloneSiteLevel();
    await cloneLevel({} as CloneLevelSource);

    const rooms = mocks.insertLocations.mock.calls[0]![0] as { id: string }[];
    expect(mocks.embed).toHaveBeenCalledTimes(1);
    expect(mocks.embed).toHaveBeenCalledWith("location", rooms.map((r) => r.id));
    expect(mocks.invalidate).toHaveBeenCalledTimes(4);
  });

  it("rethrows a failed table write, refreshes what landed, and does not navigate", async () => {
    mocks.insertRegions.mockRejectedValueOnce(new Error("quota_exceeded"));
    const { cloneLevel, isCloning } = useCloneSiteLevel();
    await expect(cloneLevel({} as CloneLevelSource)).rejects.toThrow("quota_exceeded");

    expect(mocks.insertDoors).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledTimes(4);
    expect(isCloning.value).toBe(false);
  });
});
