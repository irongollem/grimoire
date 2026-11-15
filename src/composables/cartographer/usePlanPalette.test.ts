// #884 review findings 4 and 5 — regression coverage for `usePlanPalette.ts`.
// Every data-fetching/mutation composable it touches is mocked out (the same
// approach `MapWorkbench.test.ts` already uses for the same composables),
// with just enough control to simulate the two races the review found:
//
// - Finding 4: two commits fired back to back, before the first's query
//   invalidation has actually landed, used to both read the same stale
//   `before` off `regions.value` — so undoing the second silently reverted
//   the first too.
// - Finding 5: `assignArea` always inserted a new region, so claiming
//   the same floor twice (or floor already traced as a Space) made two
//   overlapping rows.
import { computed, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { doorSiteSegment, eraseFromRegions, TRACE_TOOL_OPTIONS, usePlanPalette, type DoorSite, type DrawingEditor } from "./usePlanPalette";
import type { DerivedSpace } from "@/cartographer/structure.types";
import { emptyLayers, type CellKey, type DungeonMapLayers, type WallEdge } from "@/types/dungeonMap.types";
import type { SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";
import type { DoorSegment, SourceEdgeKey } from "@/types/locationDoor.types";
import { useToast } from "@/composables/useToast";
import { canonicaliseEdge } from "@/cartographer/edges";
import { putWall } from "@/cartographer/testWalls";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

interface MutationCall {
  vars: unknown;
  onSuccess?: (data: unknown) => void;
  onError?: (err: unknown) => void;
}

const { updateRegionStub, createRegionStub, deleteRegionStub, createDoorStub, updateDoorStub, deleteDoorStub, regionsData } = vi.hoisted(() => {
  function stub() {
    const calls: MutationCall[] = [];
    const mutate = vi.fn((vars: unknown, opts?: { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void }) => {
      calls.push({ vars, onSuccess: opts?.onSuccess, onError: opts?.onError });
    });
    const mutateAsync = vi.fn(async (vars: unknown) => vars);
    return { mutate, mutateAsync, isPending: { value: false }, calls };
  }
  return {
    updateRegionStub: stub(),
    createRegionStub: stub(),
    deleteRegionStub: stub(),
    createDoorStub: stub(),
    updateDoorStub: stub(),
    deleteDoorStub: stub(),
    regionsData: { value: [] as LocationMapRegion[] },
  };
});

vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  useLocationMapRegions: () => ({ data: regionsData }),
  useCreateLocationMapRegion: () => createRegionStub,
  useUpdateLocationMapRegion: () => updateRegionStub,
  useDeleteLocationMapRegion: () => deleteRegionStub,
  dmEdit: (update: Record<string, unknown>) => ({ ...update, derived_from: "dm" }),
}));
vi.mock("@/composables/locations/useLocationDoors", () => ({
  useCreateLocationDoor: () => createDoorStub,
  useUpdateLocationDoor: () => updateDoorStub,
  useDeleteLocationDoor: () => deleteDoorStub,
}));
/** The site's listed doors. "door-1" is the door the placement tests arm; a test that needs another kind replaces it
 *  BEFORE making its palette (the palette reads this once). */
const { waysData } = vi.hoisted(() => ({ waysData: { value: [] as { id: string; door_kind: "door" | "arch" }[] } }));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: waysData }) }));
beforeEach(() => {
  waysData.value = [{ id: "door-1", door_kind: "door" }];
});
const { childLocations } = vi.hoisted(() => ({ childLocations: { value: [] as { id: string; name: string }[] } }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocations: () => ({ data: childLocations }) }));

const edgeSite = (edgeKey: string): DoorSite => ({ kind: "edge", edgeKey: edgeKey as SourceEdgeKey });

function makeRegion(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "r1",
    user_id: "user-1",
    site_location_id: "site-1",
    space_location_id: null,
    cells: [],
    label: null,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "dm",
    cell_signature: null,
    vertices: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("usePlanPalette", () => {
  beforeEach(() => {
    regionsData.value = [];
    for (const stub of [updateRegionStub, createRegionStub, deleteRegionStub, createDoorStub, updateDoorStub, deleteDoorStub]) {
      stub.calls.length = 0;
      stub.mutate.mockClear();
      stub.mutateAsync.mockClear();
      stub.mutateAsync.mockImplementation(async (vars: unknown) => vars);
    }
  });

  describe("eraseCells", () => {
    it("trims only the regions the stroke crossed, bound rooms included", () => {
      regionsData.value = [
        makeRegion({ id: "room", space_location_id: "loc-1", cells: ["0,0", "1,0"] }),
        makeRegion({ id: "untouched", cells: ["9,9"] }),
      ];
      const plan = usePlanPalette(computed(() => "site-1"));
      plan.eraseCells(new Set(["1,0"]));
      expect(updateRegionStub.calls.map((c) => c.vars)).toEqual([
        { id: "room", update: { cells: ["0,0"], vertices: null, derived_from: "dm" } },
      ]);
    });

    it("reads a stroke's own unsettled result, so a second erase trims from it", () => {
      regionsData.value = [makeRegion({ id: "r1", cells: ["0,0", "1,0", "2,0"] })];
      const plan = usePlanPalette(computed(() => "site-1"));
      plan.eraseCells(new Set(["0,0"]));
      plan.eraseCells(new Set(["1,0"]));
      expect((updateRegionStub.calls[1]!.vars as { update: { cells: string[] } }).update.cells).toEqual(["2,0"]);
    });
  });

  describe("commitCells — the before snapshot under rapid input (finding 4)", () => {
    it("a second stroke's undo reverts only itself, not the first", async () => {
      regionsData.value = [makeRegion({ id: "r1", cells: ["0,0"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      // Two strokes fired back to back — the query still shows the ORIGINAL
      // cells for both, since neither `onSuccess` has run yet (the real bug:
      // both used to read `before` off that same stale snapshot).
      plan.commitCells("r1", ["0,0", "0,1"]); // stroke 1
      plan.commitCells("r1", ["0,0", "0,1", "0,2"]); // stroke 2

      updateRegionStub.calls[0]!.onSuccess?.({});
      updateRegionStub.calls[1]!.onSuccess?.({});

      await plan.undo.undo(); // undoes stroke 2 only
      const firstUndoCall = updateRegionStub.mutateAsync.mock.calls.at(-1)![0] as { update: { cells: string[] } };
      expect(firstUndoCall.update.cells).toEqual(["0,0", "0,1"]); // stroke 1's result, not the pre-stroke-1 original

      await plan.undo.undo(); // undoes stroke 1
      const secondUndoCall = updateRegionStub.mutateAsync.mock.calls.at(-1)![0] as { update: { cells: string[] } };
      expect(secondUndoCall.update.cells).toEqual(["0,0"]); // back to the true original
    });
  });

  describe("commitCells that fails to save", () => {
    it("goes back to the shape that is saved, so the next stroke does not build on squares that were never written", () => {
      regionsData.value = [makeRegion({ id: "r1", cells: ["0,0"], vertices: [[0, 0], [1, 0], [1, 1], [0, 1]] })];
      const plan = usePlanPalette(computed(() => "site-1"));
      plan.commitCells("r1", ["0,0", "0,1"]);
      expect(plan.regionStateNow("r1").cells).toEqual(["0,0", "0,1"]);

      updateRegionStub.calls.at(-1)!.onError?.(new Error("offline"));
      expect(plan.regionStateNow("r1")).toEqual({ cells: ["0,0"], vertices: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    });

    it("leaves a newer stroke alone when an older one fails after it", () => {
      regionsData.value = [makeRegion({ id: "r1", cells: ["0,0"] })];
      const plan = usePlanPalette(computed(() => "site-1"));
      plan.commitCells("r1", ["0,0", "0,1"]);
      const older = updateRegionStub.calls.at(-1)!;
      plan.commitCells("r1", ["0,0", "0,1", "0,2"]);

      older.onError?.(new Error("offline"));
      expect(plan.regionStateNow("r1").cells).toEqual(["0,0", "0,1", "0,2"]);
    });
  });

  describe("assignArea: no overlapping duplicates (finding 5)", () => {
    it("selects an existing space that already covers the claimed floor instead of duplicating it", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "0,1"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.assignArea(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("selects an existing space on a partial overlap too — floor already traced by hand", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "0,1", "0,2"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.assignArea(["0,0", "0,1", "0,2", "0,3"]); // the flood fill found one more cell than the hand trace

      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("still creates a genuinely new region when nothing covers it, as the walls' own room so Find again may redraw it", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["5,5"] })];
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region", cells: ["0,0", "0,1"], region_role: "space" });
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.assignArea(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).toHaveBeenCalledOnce();
      expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ region_role: "space", derived_from: "floodfill" }));
    });

    // Assigning up to the walls must give the room the walls' own line, or a round chapel is assigned as a staircase.
    it("gives the assigned room the outline of the found room that holds exactly those squares", async () => {
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region" });
      const chapel: DerivedSpace = { key: "s:0,0", cells: ["0,0", "0,1"], signature: "sig", outline: [[0, 0], [1, 0], [1, 2]], name: null, nameSource: null };
      const plan = usePlanPalette(computed(() => "site-1"), () => [chapel]);
      await plan.assignArea(["0,1", "0,0"]);
      expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ vertices: chapel.outline }));
    });

    it("leaves the outline off when no found room has exactly those squares", async () => {
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region" });
      const chapel: DerivedSpace = { key: "s:0,0", cells: ["0,0", "0,1", "0,2"], signature: "sig", outline: [[0, 0], [1, 0], [1, 2]], name: null, nameSource: null };
      const plan = usePlanPalette(computed(() => "site-1"), () => [chapel]);
      await plan.assignArea(["0,0", "0,1"]);
      expect(createRegionStub.mutateAsync.mock.calls[0]![0]).not.toHaveProperty("vertices");
      // ...and the other way: an assigned area bigger than the room is not that room either.
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region-2" });
      const small: DerivedSpace = { ...chapel, cells: ["0,0", "0,1"] };
      const plan2 = usePlanPalette(computed(() => "site-1"), () => [small]);
      await plan2.assignArea(["0,0", "0,1", "0,2"]);
      expect(createRegionStub.mutateAsync.mock.calls[1]![0]).not.toHaveProperty("vertices");
    });

    // A ring of walls with no floor is in no found-room list, so a "floodfill" row there would read to Find again as
    // a room whose walls are gone. Only a row mirroring painted floor keeps "floodfill".
    it("makes a room from a wall ring the DM's own, with the ring as its outline", async () => {
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region" });
      const plan = usePlanPalette(computed(() => "site-1"));
      const ring: [number, number][] = [[0, 0], [2, 0], [2, 1], [0, 1]];
      await plan.assignArea(["0,0", "1,0"], ring);
      expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ region_role: "space", derived_from: "dm", vertices: ring }),
      );
    });

    it("selects the existing room instead of duplicating it when the wall ring was assigned before", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "1,0"] })];
      const plan = usePlanPalette(computed(() => "site-1"));
      await plan.assignArea(["0,0", "1,0"], [[0, 0], [2, 0], [2, 1], [0, 1]]);
      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("ignores a zone that happens to cover the same cells — only an existing space counts", async () => {
      regionsData.value = [makeRegion({ id: "zone-1", region_role: "zone", cells: ["0,0", "0,1"] })];
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region", cells: ["0,0", "0,1"], region_role: "space" });
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.assignArea(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).toHaveBeenCalledOnce();
    });
  });
});

describe("usePlanPalette pen rings, conversions and doors", () => {
  beforeEach(() => {
    regionsData.value = [];
    for (const stub of [updateRegionStub, createRegionStub, deleteRegionStub, createDoorStub, updateDoorStub, deleteDoorStub]) {
      stub.calls.length = 0;
      stub.mutate.mockClear();
      stub.mutateAsync.mockClear();
      stub.mutateAsync.mockImplementation(async (vars: unknown) => vars);
    }
  });

  const SQUARE: [number, number][] = [[0, 0], [3, 0], [3, 3], [0, 3]];
  const door = (over: Record<string, unknown> = {}) => ({
    id: "door-1", from_location_id: "a", to_location_id: "b", label: "Oak", is_one_way: false, starts_locked: true,
    lock_note: "key", is_secret: false, sort_order: 1, door_kind: "door", edge_key: "3,2:W", derived_from: "dm",
    dungeon_feature_id: null, library_dungeon_feature_id: null, ...over,
  }) as never;

  it("a pen ring stores its vertices with the cells it encloses, and undo puts the earlier shape back", async () => {
    regionsData.value = [makeRegion({ id: "r1", cells: ["9,9"] })];
    const plan = usePlanPalette(computed(() => "site-1"));
    await plan.commitRing("r1", SQUARE);
    const stored = (updateRegionStub.mutateAsync.mock.calls[0]![0] as { update: { vertices: unknown; cells: string[] } }).update;
    expect(stored.vertices).toEqual(SQUARE);
    expect(stored.cells).toContain("1,1");
    expect(stored.cells).not.toContain("9,9");

    await plan.undo.undo();
    expect((updateRegionStub.mutateAsync.mock.calls.at(-1)![0] as { update: { cells: string[]; vertices: unknown } }).update)
      .toMatchObject({ cells: ["9,9"], vertices: null });
  });

  it("a failed pen ring rejects so the draft is kept, leaves nothing to undo, and the next read is the earlier shape", async () => {
    regionsData.value = [makeRegion({ id: "r1", cells: ["9,9"] })];
    updateRegionStub.mutateAsync.mockRejectedValueOnce(new Error("offline"));
    const plan = usePlanPalette(computed(() => "site-1"));
    await expect(plan.commitRing("r1", SQUARE)).rejects.toThrow("offline");
    expect(plan.undo.canUndo.value).toBe(false);
    plan.eraseCells(new Set(["9,9"]));
    expect((updateRegionStub.calls[0]!.vars as { update: { cells: string[] } }).update.cells).toEqual([]);
  });

  describe("erase on a region with a ring (#1197)", () => {
    // A 6 by 6 ring over the squares 0..5 in both directions.
    const BIG: [number, number][] = [[0, 0], [6, 0], [6, 6], [0, 6]];
    const BIG_CELLS = Array.from({ length: 36 }, (_, i) => `${i % 6},${Math.floor(i / 6)}` as CellKey);

    it("carves the ring itself, so the shape drawn matches the squares left (vertices never describe the old shape)", () => {
      regionsData.value = [makeRegion({ id: "r1", cells: BIG_CELLS, vertices: BIG })];
      const plan = usePlanPalette(computed(() => "site-1"));
      // Erasing the squares with x 3..5 (all rows) leaves the left half: a 3 by 6 rectangle.
      plan.eraseCells(new Set(BIG_CELLS.filter((c) => Number(c.split(",")[0]) >= 3)));
      // `commitRing` reaches the mutation synchronously, before its first await.
      expect(updateRegionStub.mutateAsync).toHaveBeenCalledOnce();
      const update = (updateRegionStub.mutateAsync.mock.calls[0]![0] as { update: { vertices: [number, number][]; cells: string[] } }).update;
      // Reasoned: the kept half is x in [0, 3], so no vertex may sit right of x = 3 (plus raster slack), and its
      // squares are exactly the 18 with x 0..2.
      expect(Math.max(...update.vertices.map((v) => v[0]))).toBeLessThan(3.2);
      expect([...update.cells].sort()).toEqual(BIG_CELLS.filter((c) => Number(c.split(",")[0]) < 3).sort());
    });

    it("erasing every square empties the region and drops its ring, so no ring outlives its squares", () => {
      regionsData.value = [makeRegion({ id: "r1", cells: BIG_CELLS, vertices: BIG })];
      const plan = usePlanPalette(computed(() => "site-1"));
      plan.eraseCells(new Set(BIG_CELLS));
      expect(updateRegionStub.calls.map((c) => c.vars)).toEqual([
        { id: "r1", update: { cells: [], vertices: null, derived_from: "dm" } },
      ]);
    });

    it("an erase that touches no square of the ring writes nothing", () => {
      regionsData.value = [makeRegion({ id: "r1", cells: BIG_CELLS, vertices: BIG })];
      const plan = usePlanPalette(computed(() => "site-1"));
      plan.eraseCells(new Set(["20,20"]));
      expect(updateRegionStub.calls).toEqual([]);
      expect(updateRegionStub.mutateAsync).not.toHaveBeenCalled();
    });
  });

  it("starts with a brush of three quarters of a square and offers Lasso as a fourth way to trace", () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    expect(plan.brushRadius.value).toBe(0.75);
    expect(TRACE_TOOL_OPTIONS.map((o) => o.value)).toEqual(["paint", "pen", "template", "lasso"]);
  });

  it("cycles a door to an arch and an arch back to a door, undoably", async () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.cycleDoorKind(door({ door_kind: "door" }));
    plan.cycleDoorKind(door({ door_kind: "arch" }));
    expect(updateDoorStub.calls.map((c) => (c.vars as { update: { door_kind: string } }).update.door_kind)).toEqual(["arch", "door"]);
    updateDoorStub.calls[0]!.onSuccess?.({});
    await plan.undo.undo();
    expect(updateDoorStub.mutateAsync).toHaveBeenLastCalledWith({ id: "door-1", update: { door_kind: "door" } });
  });

  it("removing a door can be undone by recreating it with everything it had", async () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.removeDoor(door());
    expect(deleteDoorStub.calls[0]!.vars).toBe("door-1");
    deleteDoorStub.calls[0]!.onSuccess?.({});
    createDoorStub.mutateAsync.mockResolvedValueOnce({ id: "door-2" });
    await plan.undo.undo();
    expect(createDoorStub.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Oak", starts_locked: true, lock_note: "key", edge_key: "3,2:W", from_location_id: "a", to_location_id: "b" }),
    );
    // Redoing the removal deletes the recreated door, not the one that is gone.
    await plan.undo.redo();
    expect(deleteDoorStub.mutateAsync).toHaveBeenLastCalledWith("door-2");
  });

  // The database holds edge_key and segment together (a CHECK): a wall-uuid
  // door re-inserted without its line would be refused and the undo would fail.
  it("undoing the removal of an angled door re-inserts its line with its wall id", async () => {
    const wallId = "6f1c2d3e-0000-4000-8000-000000000001";
    const line = [[2, 2], [4, 4]];
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.removeDoor(door({ edge_key: wallId, segment: line }));
    deleteDoorStub.calls[0]!.onSuccess?.({});
    createDoorStub.mutateAsync.mockResolvedValueOnce({ id: "door-2" });
    await plan.undo.undo();
    expect(createDoorStub.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ edge_key: wallId, segment: line }));
  });

  it("starts a new zone with the chosen kind and a trimmed label, or none when blank, and makes it active", async () => {
    createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "z1" });
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.zoneKind.value = "hazard";
    plan.zoneLabel.value = "  Spore bloom ";
    await plan.startNew();
    expect(createRegionStub.mutateAsync).toHaveBeenLastCalledWith({ site_location_id: "site-1", region_role: "zone", zone_kind: "hazard", zone_payload: {}, label: "Spore bloom" });
    expect(plan.activeRegionId.value).toBe("z1");
    createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "z2" });
    plan.zoneLabel.value = "   ";
    await plan.startNew();
    expect(createRegionStub.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ label: null }));
  });

  it("claims nothing for an empty floor selection", async () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    await plan.assignArea([]);
    expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
  });

  it("creates nothing without a site", async () => {
    const plan = usePlanPalette(computed(() => null));
    expect(await plan.startNew()).toBeNull();
    await plan.assignArea(["0,0"]);
    expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
  });
});

// #1125 frame 08: "Place it" puts a door that is only in the list onto the map.
describe("usePlanPalette armDoorPlacement", () => {
  beforeEach(() => {
    for (const stub of [createDoorStub, updateDoorStub]) {
      stub.calls.length = 0;
      stub.mutate.mockClear();
    }
  });

  it("the next edge takes the listed door rather than making a second one", () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.armDoorPlacement("door-1");
    expect(plan.placeArmedDoorOn(edgeSite("2,3:N"))).toBe(true);
    expect(updateDoorStub.calls.map((c) => c.vars)).toEqual([{ id: "door-1", update: { edge_key: "2,3:N", segment: null } }]);
    expect(createDoorStub.mutate).not.toHaveBeenCalled();
  });

  it("only the first edge takes it: the one after is a new door", () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.armDoorPlacement("door-1");
    plan.placeArmedDoorOn(edgeSite("2,3:N"));
    expect(plan.placeArmedDoorOn(edgeSite("5,5:W"))).toBe(false);
    expect(updateDoorStub.mutate).toHaveBeenCalledTimes(1);
  });

  it("choosing another tool lets the door go", async () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.armDoorPlacement("door-1");
    await nextTick();
    plan.planTool.value = "zone";
    await nextTick();
    expect(plan.placeArmedDoorOn(edgeSite("2,3:N"))).toBe(false);
    expect(updateDoorStub.mutate).not.toHaveBeenCalled();
  });
});

// #1195: an edge with no room in reach waits here while the options slip asks which rooms the door joins.
describe("usePlanPalette pending door", () => {
  beforeEach(() => {
    createDoorStub.calls.length = 0;
    createDoorStub.mutate.mockClear();
  });

  it("places the door on the edge that was asked about, with the rooms the DM chose", () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.planTool.value = "door";
    plan.askDoorEnds(edgeSite("4,2:W"));
    plan.placePendingDoor("crypt", null);
    expect(createDoorStub.calls.map((c) => c.vars)).toEqual([
      { from_location_id: "crypt", to_location_id: null, door_kind: "door", edge_key: "4,2:W", derived_from: "dm" },
    ]);
    expect(plan.pendingDoor.value).toBeNull();
  });

  it("an answer with no edge waiting places nothing (cancelled, or answered twice)", () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.askDoorEnds(edgeSite("4,2:W"));
    plan.cancelPendingDoor();
    plan.placePendingDoor("crypt", "gallery");
    expect(createDoorStub.mutate).not.toHaveBeenCalled();
  });

  it("choosing another tool drops the question", async () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.planTool.value = "door";
    await nextTick();
    plan.askDoorEnds(edgeSite("4,2:W"));
    plan.planTool.value = "zone";
    await nextTick();
    expect(plan.pendingDoor.value).toBeNull();
  });
});

describe("eraseFromRegions", () => {
  it("leaves out regions the stroke never reached", () => {
    const regions = [makeRegion({ id: "a", cells: ["0,0"] }), makeRegion({ id: "b", cells: ["5,5", "6,6"] })];
    expect([...eraseFromRegions(regions, new Set(["6,6"]))]).toEqual([["b", ["5,5"]]]);
  });
});

// #1125 frames 18-19: the walls' rooms are in the list before they are rows.
describe("usePlanPalette found rooms", () => {
  const space = (key: string, cell: CellKey, name: string | null = null): DerivedSpace => ({
    key, cells: [cell, "9,9"], signature: `sig-${key}`, outline: [[0, 0], [1, 0], [1, 1]], name, nameSource: name ? "annotation" : null,
  });

  beforeEach(() => {
    regionsData.value = [];
    childLocations.value = [];
    for (const stub of [updateRegionStub, createRegionStub]) {
      stub.calls.length = 0;
      stub.mutateAsync.mockClear();
      stub.mutateAsync.mockImplementation(async (vars: unknown) => vars);
    }
  });

  it("a found room is in the list the moment the drawing has it, without anything being written", () => {
    const plan = usePlanPalette(computed(() => "site-1"), () => [space("s:0,0", "0,0", "Nave")]);
    expect(plan.zoning.value.map((e) => e.kind)).toEqual(["found"]);
    expect(plan.foundCount.value).toBe(1);
    expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
  });

  it("a found room has no row, so it reaches the canvas as a room with an id that is not a row's", () => {
    const plan = usePlanPalette(computed(() => "site-1"), () => [space("s:0,0", "0,0")]);
    expect(plan.foundRegions.value).toHaveLength(1);
    expect(plan.foundRegions.value[0]!.id).toBe("found:s:0,0");
    expect(plan.foundRegions.value[0]!.region_role).toBe("space");
  });

  it("renaming a found room writes a row stamped dm, so Find again leaves it alone", async () => {
    const found = space("s:0,0", "0,0");
    const plan = usePlanPalette(computed(() => "site-1"), () => [found]);
    await plan.renameEntry(plan.zoning.value[0]!, "Reliquary");
    expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ derived_from: "dm", label: "Reliquary", cell_signature: "sig-s:0,0", region_role: "space" }),
    );
  });

  it("renaming an existing found row puts derived_from dm in the same update", async () => {
    const found = space("s:0,0", "0,0");
    regionsData.value = [makeRegion({ id: "row", derived_from: "floodfill", cell_signature: "sig-s:0,0", cells: found.cells })];
    const plan = usePlanPalette(computed(() => "site-1"), () => [found]);
    await plan.renameEntry(plan.zoning.value[0]!, "Reliquary");
    expect(updateRegionStub.mutateAsync).toHaveBeenCalledWith({ id: "row", update: { label: "Reliquary", derived_from: "dm" } });
  });

  it("binding a found room to a place stamps it dm as well", async () => {
    const plan = usePlanPalette(computed(() => "site-1"), () => [space("s:0,0", "0,0")]);
    await plan.bindEntry(plan.zoning.value[0]!, "loc-1");
    expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ derived_from: "dm", space_location_id: "loc-1" }));
  });

  it("Find again sends only the rooms the DM never touched", async () => {
    const moved = space("s:0,0", "0,0");
    const touched = space("s:5,0", "5,0");
    regionsData.value = [
      makeRegion({ id: "untouched", derived_from: "floodfill", cell_signature: "stale", cells: ["0,0"] }),
      makeRegion({ id: "mine", derived_from: "dm", cell_signature: "stale", cells: ["5,0"], label: "Mine" }),
    ];
    const plan = usePlanPalette(computed(() => "site-1"), () => [moved, touched]);
    const sent = await plan.findAgainNow();
    expect(sent).toBe(1);
    expect(updateRegionStub.mutateAsync).toHaveBeenCalledTimes(1);
    expect(updateRegionStub.mutateAsync).toHaveBeenCalledWith({ id: "untouched", update: { cells: moved.cells, cell_signature: "sig-s:0,0", vertices: moved.outline } });
  });

  it("clicking a found room on the map writes it as the walls' room and makes it the one being traced", async () => {
    createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-row" });
    const plan = usePlanPalette(computed(() => "site-1"), () => [space("s:0,0", "0,0")]);
    await plan.selectRegion("found:s:0,0");
    expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ derived_from: "floodfill" }));
    expect(plan.activeRegionId.value).toBe("new-row");
  });

  it("selecting a real row just selects it, writing nothing", async () => {
    const plan = usePlanPalette(computed(() => "site-1"), () => []);
    await plan.selectRegion("row-1");
    expect(plan.activeRegionId.value).toBe("row-1");
    expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
  });

  it("the Room kind makes a space and any other kind makes a zone of that kind", async () => {
    createRegionStub.mutateAsync.mockResolvedValue({ id: "n" });
    const plan = usePlanPalette(computed(() => "site-1"));
    await plan.startNew();
    expect(createRegionStub.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ region_role: "space" }));
    plan.zoneKind.value = "entrance";
    await plan.startNew();
    expect(createRegionStub.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ region_role: "zone", zone_kind: "entrance" }));
  });

  it("assigning a zone kind makes a zone even over a room, and is the DM's ink", async () => {
    regionsData.value = [makeRegion({ id: "room", cells: ["0,0", "0,1"] })];
    createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "z" });
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.zoneKind.value = "hazard";
    await plan.assignArea(["0,0", "0,1"]);
    expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ region_role: "zone", zone_kind: "hazard", derived_from: "dm", cells: ["0,0", "0,1"] }),
    );
  });

  describe("wallRings: the rings of walls and how many are not a room yet", () => {
    /** A box of lattice walls w x h at (x0, y0): no floor painted, only walls. */
    function boxOfWalls(layers: ReturnType<typeof emptyLayers>, x0: number, y0: number, w: number, h: number): void {
      const put = (x: number, y: number, side: "N" | "S" | "W" | "E"): void => {
        const o = canonicaliseEdge(x, y, side);
        putWall(layers, o.x, o.y, o.side, { pack_id: "p", pack_version: 1, variant: 0, type: "wall" });
      };
      for (let x = x0; x < x0 + w; x++) {
        put(x, y0, "N");
        put(x, y0 + h - 1, "S");
      }
      for (let y = y0; y < y0 + h; y++) {
        put(x0, y, "W");
        put(x0 + w - 1, y, "E");
      }
    }
    const left = ["0,0", "1,0", "0,1", "1,1"] as CellKey[];

    it("counts none when no layers are given or the walls close nothing", () => {
      expect(usePlanPalette(computed(() => "site-1")).wallRings.value).toEqual({ rings: 0, unassigned: 0 });
      expect(usePlanPalette(computed(() => "site-1"), () => [], () => emptyLayers()).wallRings.value).toEqual({ rings: 0, unassigned: 0 });
    });

    it("counts one ring, not a room yet, when no row covers it", () => {
      const layers = emptyLayers();
      boxOfWalls(layers, 0, 0, 2, 2);
      const plan = usePlanPalette(computed(() => "site-1"), () => [], () => layers);
      expect(plan.wallRings.value).toEqual({ rings: 1, unassigned: 1 });
    });

    it("leaves out a ring too small to hold a square, which could never be assigned", () => {
      // A 0.8-cell ring (0.6 to 1.4) holds no square middle; the 2x2 box beside it is the one ring that counts.
      const layers = emptyLayers();
      layers.walls.a = { pack_id: "p", pack_version: 1, variant: 0, type: "wall", a: [10.6, 0.6], b: [11.4, 0.6] };
      layers.walls.b = { pack_id: "p", pack_version: 1, variant: 0, type: "wall", a: [11.4, 0.6], b: [11.4, 1.4] };
      layers.walls.c = { pack_id: "p", pack_version: 1, variant: 0, type: "wall", a: [11.4, 1.4], b: [10.6, 1.4] };
      layers.walls.d = { pack_id: "p", pack_version: 1, variant: 0, type: "wall", a: [10.6, 1.4], b: [10.6, 0.6] };
      boxOfWalls(layers, 0, 0, 2, 2);
      const plan = usePlanPalette(computed(() => "site-1"), () => [], () => layers);
      expect(plan.wallRings.value).toEqual({ rings: 1, unassigned: 1 });
    });

    it("counts a ring as assigned once a room row holds all its squares, and the other still waiting", () => {
      // Two 2x2 rings, one at x 0..1 and one at x 5..6. Only the first has a room row.
      const layers = emptyLayers();
      boxOfWalls(layers, 0, 0, 2, 2);
      boxOfWalls(layers, 5, 0, 2, 2);
      regionsData.value = [makeRegion({ id: "room", cells: left })];
      const plan = usePlanPalette(computed(() => "site-1"), () => [], () => layers);
      expect(plan.wallRings.value).toEqual({ rings: 2, unassigned: 1 });
    });

    it("does not count a ring as assigned by a zone", () => {
      const layers = emptyLayers();
      boxOfWalls(layers, 0, 0, 2, 2);
      regionsData.value = [makeRegion({ id: "zone", region_role: "zone", zone_kind: "hazard", cells: left })];
      const plan = usePlanPalette(computed(() => "site-1"), () => [], () => layers);
      expect(plan.wallRings.value).toEqual({ rings: 1, unassigned: 1 });
    });

    it("counts a ring a room reaches into as that room's, as Assign does: a click there selects it and makes nothing", async () => {
      const layers = emptyLayers();
      boxOfWalls(layers, 0, 0, 2, 2);
      regionsData.value = [makeRegion({ id: "partial", cells: ["0,0", "1,0"] })];
      const plan = usePlanPalette(computed(() => "site-1"), () => [], () => layers);
      expect(plan.wallRings.value).toEqual({ rings: 1, unassigned: 0 });
      // The other half of the one rule: Assign on that ring writes no row.
      createRegionStub.mutateAsync.mockClear();
      await plan.assignArea(left, [[0, 0], [2, 0], [2, 2], [0, 2]]);
      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("partial");
    });
  });
});

// #1197 frame 06: a door is a stretch of the wall. The click writes the way out and cuts the Drawing, as one undo step.
describe("usePlanPalette doors cut into the Drawing", () => {
  const MATERIAL = { pack_id: "stone", pack_version: 1, variant: 0 };
  const wall = (a: [number, number], b: [number, number], over: Partial<WallEdge> = {}): WallEdge => ({ ...MATERIAL, type: "wall", a, b, ...over });
  const { toasts } = useToast();

  /** A Drawing the palette edits through the same contract the canvas editor offers: snapshots, no command stack. */
  function drawing(walls: Record<string, WallEdge>) {
    const state: { layers: DungeonMapLayers } = { layers: { ...emptyLayers(), walls } };
    const editor: DrawingEditor = {
      editDrawing(mutate) {
        const before = structuredClone(state.layers);
        const next = mutate(state.layers);
        if (!next) return null;
        state.layers = next;
        const after = structuredClone(next);
        return {
          undo: () => { state.layers = structuredClone(before); },
          redo: () => { state.layers = structuredClone(after); },
        };
      },
    };
    return { state, editor };
  }

  function palette(walls: Record<string, WallEdge>, bind = true) {
    const d = drawing(walls);
    const plan = usePlanPalette(computed(() => "site-1"), () => [], () => d.state.layers);
    if (bind) plan.bindDrawingEditor(d.editor);
    return { plan, ...d };
  }

  const wallSite = (wallId: string, from: [number, number], to: [number, number]): DoorSite => ({ kind: "wall", wallId, from, to });

  beforeEach(() => {
    for (const stub of [createDoorStub, updateDoorStub, deleteDoorStub]) {
      stub.calls.length = 0;
      stub.mutate.mockClear();
      stub.mutateAsync.mockClear();
      stub.mutateAsync.mockImplementation(async (vars: unknown) => vars);
    }
    toasts.value = [];
  });

  it("a click on an angled wall cuts the Drawing and writes the row under the door's wall key, with its line", () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    plan.placeDoorAt(wallSite("w", [4, 0], [5, 0]), "nave", "crypt");

    const ids = Object.keys(state.layers.walls);
    expect(ids).toHaveLength(3);
    const doorKey = ids.find((id) => state.layers.walls[id]!.type === "doorClosed")!;
    expect(doorKey).not.toBe("w");
    // The row names the door's own wall, so a later publish matches the two instead of making a second door.
    expect(createDoorStub.calls.map((c) => c.vars)).toEqual([
      { from_location_id: "nave", to_location_id: "crypt", door_kind: "door", edge_key: doorKey, segment: [[4, 0], [5, 0]], derived_from: "dm" },
    ]);
  });

  it("a click on a grid wall switches it in place and writes a row with no segment, as the database requires", () => {
    const { plan, state } = palette({ "3,2:W": wall([3, 3], [3, 2]) });
    plan.placeDoorAt(wallSite("3,2:W", [3, 3], [3, 2]), "a", null);
    expect(state.layers.walls["3,2:W"]!.type).toBe("doorClosed");
    expect(createDoorStub.calls[0]!.vars).toEqual({ from_location_id: "a", to_location_id: null, door_kind: "door", edge_key: "3,2:W", derived_from: "dm" });
  });

  it("an arch cuts the wall open and writes an arch row", () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    plan.newDoorKind.value = "arch";
    plan.placeDoorAt(wallSite("w", [4, 0], [5, 0]), "a", "b");
    expect(Object.values(state.layers.walls).filter((w) => w.type === "doorOpen")).toHaveLength(1);
    expect(createDoorStub.calls[0]!.vars).toMatchObject({ door_kind: "arch" });
  });

  it("a door drawn where there is no wall adds a hidden door wall and its row", () => {
    const { plan, state } = palette({});
    plan.placeDoorAt({ kind: "free", from: [2, 2], to: [3, 2] }, "a", "b");
    const [key, door] = Object.entries(state.layers.walls)[0]!;
    expect(door).toEqual({ type: "doorClosed", a: [2, 2], b: [3, 2], visible: false, freeStanding: true, pack_id: "", pack_version: 0, variant: 0 });
    expect(createDoorStub.calls[0]!.vars).toMatchObject({ edge_key: key, segment: [[2, 2], [3, 2]] });
  });

  it("a grid edge with no wall writes only the row and leaves the Drawing alone, even with no editor bound", () => {
    const { plan, state } = palette({}, false);
    plan.placeDoorAt(edgeSite("4,2:W"), "a", "b");
    expect(state.layers.walls).toEqual({});
    expect(createDoorStub.mutate).toHaveBeenCalledTimes(1);
  });

  it("cuts nothing until the DM answers 'connects which rooms', and cancelling cuts nothing at all", () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    plan.askDoorEnds(wallSite("w", [4, 0], [5, 0]));
    expect(Object.keys(state.layers.walls)).toEqual(["w"]);
    plan.cancelPendingDoor();
    plan.placePendingDoor("a", "b");
    expect(Object.keys(state.layers.walls)).toEqual(["w"]);
    expect(createDoorStub.mutate).not.toHaveBeenCalled();

    plan.askDoorEnds(wallSite("w", [4, 0], [5, 0]));
    plan.placePendingDoor("a", "b");
    expect(Object.keys(state.layers.walls)).toHaveLength(3);
    expect(createDoorStub.mutate).toHaveBeenCalledTimes(1);
  });

  it("one Plan undo takes out the row and the cut together, and one redo puts both back", async () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    const original = structuredClone(state.layers.walls);
    plan.placeDoorAt(wallSite("w", [4, 0], [5, 0]), "a", "b");
    const cutWalls = structuredClone(state.layers.walls);
    createDoorStub.calls[0]!.onSuccess?.({ id: "row-1" });

    // The row is deleted first, so no row ever outlives its wall.
    deleteDoorStub.mutateAsync.mockImplementation(async () => {
      expect(state.layers.walls).toEqual(cutWalls);
    });
    await plan.undo.undo();
    expect(deleteDoorStub.mutateAsync).toHaveBeenCalledWith("row-1");
    expect(state.layers.walls).toEqual(original);

    createDoorStub.mutateAsync.mockImplementation(async () => {
      // The wall is back before the row is.
      expect(state.layers.walls).toEqual(cutWalls);
      return { id: "row-2" };
    });
    await plan.undo.redo();
    expect(state.layers.walls).toEqual(cutWalls);
    expect(createDoorStub.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("takes the cut back out when the database refuses the row", () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    const original = structuredClone(state.layers.walls);
    plan.placeDoorAt(wallSite("w", [4, 0], [5, 0]), "a", "b");
    createDoorStub.calls[0]!.onError?.(new Error("no"));
    expect(state.layers.walls).toEqual(original);
    expect(toasts.value).toHaveLength(1);
  });

  it("says so, and writes nothing, when the wall has gone by the time the door is placed", () => {
    const { plan } = palette({});
    plan.placeDoorAt(wallSite("gone", [4, 0], [5, 0]), "a", "b");
    expect(createDoorStub.mutate).not.toHaveBeenCalled();
    expect(toasts.value).toHaveLength(1);
  });

  it("refuses a wall or free door while no Drawing is bound rather than writing a row with no wall", () => {
    const { plan } = palette({ w: wall([0, 0], [10, 0]) }, false);
    plan.placeDoorAt(wallSite("w", [4, 0], [5, 0]), "a", "b");
    expect(createDoorStub.mutate).not.toHaveBeenCalled();
    expect(toasts.value).toHaveLength(1);
  });

  it("puts a listed door on a wall with the same cut, and its undo clears the line as well as the key", async () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    const original = structuredClone(state.layers.walls);
    plan.armDoorPlacement("door-1");
    plan.placeArmedDoorOn(wallSite("w", [4, 0], [5, 0]));
    const doorKey = Object.keys(state.layers.walls).find((id) => state.layers.walls[id]!.type === "doorClosed")!;
    expect(updateDoorStub.calls[0]!.vars).toEqual({ id: "door-1", update: { edge_key: doorKey, segment: [[4, 0], [5, 0]] } });
    updateDoorStub.calls[0]!.onSuccess?.({});
    await plan.undo.undo();
    expect(updateDoorStub.mutateAsync).toHaveBeenCalledWith({ id: "door-1", update: { edge_key: null, segment: null } });
    expect(state.layers.walls).toEqual(original);
  });

  it("a listed arch is cut as an arch whatever the Door or Arch chip says, since its row stays an arch", () => {
    waysData.value = [{ id: "door-1", door_kind: "arch" }];
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    plan.newDoorKind.value = "door";
    plan.armDoorPlacement("door-1");
    plan.placeArmedDoorOn(wallSite("w", [4, 0], [5, 0]));
    expect(Object.values(state.layers.walls).map((w) => w.type).sort()).toEqual(["doorOpen", "wall", "wall"]);
  });

  it("a listed door is cut as a door with the Arch chip chosen", () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    plan.newDoorKind.value = "arch";
    plan.armDoorPlacement("door-1");
    plan.placeArmedDoorOn(wallSite("w", [4, 0], [5, 0]));
    expect(Object.values(state.layers.walls).map((w) => w.type).sort()).toEqual(["doorClosed", "wall", "wall"]);
  });

  const way = (over: Partial<SiteDoorWithSpaces>): SiteDoorWithSpaces =>
    ({
      id: "row-1", from_location_id: "a", to_location_id: "b", label: "", is_one_way: false, starts_locked: false, lock_note: null,
      is_secret: false, sort_order: null, door_kind: "door", edge_key: null, segment: null, derived_from: "dm",
      dungeon_feature_id: null, library_dungeon_feature_id: null, ...over,
    }) as SiteDoorWithSpaces;

  it("cycling a way flips the matching door in the Drawing in the same undo step, for a wall key as for a grid key", async () => {
    const { plan, state } = palette({ d: wall([4, 0], [5, 0], { type: "doorClosed" }), "1,1:N": wall([1, 1], [2, 1], { type: "doorClosed" }) });
    plan.cycleDoorKind(way({ edge_key: "d", segment: [[4, 0], [5, 0]] }));
    updateDoorStub.calls[0]!.onSuccess?.({});
    expect(state.layers.walls.d!.type).toBe("doorOpen");
    await plan.undo.undo();
    expect(state.layers.walls.d!.type).toBe("doorClosed");

    plan.cycleDoorKind(way({ edge_key: "1,1:N" }));
    updateDoorStub.calls[1]!.onSuccess?.({});
    expect(state.layers.walls["1,1:N"]!.type).toBe("doorOpen");
  });

  it("cycling a way whose key names no wall changes only the row", () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    const before = structuredClone(state.layers.walls);
    plan.cycleDoorKind(way({ edge_key: "4,2:W" }));
    updateDoorStub.calls[0]!.onSuccess?.({});
    expect(state.layers.walls).toEqual(before);
    expect(updateDoorStub.calls[0]!.vars).toEqual({ id: "row-1", update: { door_kind: "arch" } });
  });

  it("removing a way turns a cut door back into a wall and deletes a free-standing one, and undo restores either", async () => {
    // The door at (4,0)-(5,0) was cut from a wall. The one at (7,7) was drawn free across an opening, which it says.
    const { plan, state } = palette({
      before: wall([0, 0], [4, 0]),
      cut: wall([4, 0], [5, 0], { type: "doorClosed" }),
      free: wall([7, 7], [8, 7], { type: "doorClosed", visible: false, freeStanding: true }),
    });
    plan.removeDoor(way({ id: "r-cut", edge_key: "cut", segment: [[4, 0], [5, 0]] }));
    deleteDoorStub.calls[0]!.onSuccess?.({});
    expect(state.layers.walls.cut!.type).toBe("wall");
    plan.removeDoor(way({ id: "r-free", edge_key: "free", segment: [[7, 7], [8, 7]] }));
    deleteDoorStub.calls[1]!.onSuccess?.({});
    expect(state.layers.walls.free).toBeUndefined();

    createDoorStub.mutateAsync.mockImplementation(async () => {
      // The door is back in the Drawing before its row is.
      expect(state.layers.walls.free).toBeDefined();
      return { id: "r-free-2" };
    });
    await plan.undo.undo();
    expect(state.layers.walls.free!.type).toBe("doorClosed");
    expect(state.layers.walls.cut!.type).toBe("wall");
  });

  it("removing a grid-edge way with no wall under it changes only the row", () => {
    const { plan, state } = palette({ w: wall([0, 0], [10, 0]) });
    const before = structuredClone(state.layers.walls);
    plan.removeDoor(way({ edge_key: "4,2:W" }));
    deleteDoorStub.calls[0]!.onSuccess?.({});
    expect(state.layers.walls).toEqual(before);
  });

  it("doorSiteSegment gives a grid edge's own line and a wall or free site's two points", () => {
    expect(doorSiteSegment(edgeSite("3,2:W"))).toEqual([[3, 3], [3, 2]] satisfies DoorSegment);
    expect(doorSiteSegment({ kind: "free", from: [1, 1], to: [2, 3] })).toEqual([[1, 1], [2, 3]]);
  });
});
