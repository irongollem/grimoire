// #884 review findings 4 and 5 — regression coverage for `usePlanPalette.ts`.
// Every data-fetching/mutation composable it touches is mocked out (the same
// approach `MapWorkbench.test.ts` already uses for the same composables),
// with just enough control to simulate the two races the review found:
//
// - Finding 4: two commits fired back to back, before the first's query
//   invalidation has actually landed, used to both read the same stale
//   `before` off `regions.value` — so undoing the second silently reverted
//   the first too.
// - Finding 5: `claimFloorRegion` always inserted a new region, so claiming
//   the same floor twice (or floor already traced as a Space) made two
//   overlapping rows.
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eraseFromRegions, usePlanPalette } from "./usePlanPalette";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

interface MutationCall {
  vars: unknown;
  onSuccess?: (data: unknown) => void;
  onError?: (err: unknown) => void;
}

const { updateRegionStub, createRegionStub, deleteRegionStub, createDoorStub, updateDoorStub, deleteDoorStub, regionsData, confirmAnswer } = vi.hoisted(() => {
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
    confirmAnswer: { value: true },
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
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: async () => confirmAnswer.value }) }));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocations: () => ({ data: ref([]) }) }));

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
    confirmAnswer.value = true;
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
        { id: "room", update: { cells: ["0,0"], derived_from: "dm" } },
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

  describe("claimFloorRegion — no overlapping duplicates (finding 5)", () => {
    it("selects an existing space that already covers the claimed floor instead of duplicating it", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "0,1"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.claimFloorRegion(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("selects an existing space on a partial overlap too — floor already traced by hand", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "0,1", "0,2"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.claimFloorRegion(["0,0", "0,1", "0,2", "0,3"]); // the flood fill found one more cell than the hand trace

      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("still creates a genuinely new region when nothing covers it", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["5,5"] })];
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region", cells: ["0,0", "0,1"], region_role: "space" });
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.claimFloorRegion(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).toHaveBeenCalledOnce();
    });

    it("ignores a zone that happens to cover the same cells — only an existing space counts", async () => {
      regionsData.value = [makeRegion({ id: "zone-1", region_role: "zone", cells: ["0,0", "0,1"] })];
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region", cells: ["0,0", "0,1"], region_role: "space" });
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.claimFloorRegion(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).toHaveBeenCalledOnce();
    });
  });
});

describe("usePlanPalette pen rings, conversions and doors", () => {
  beforeEach(() => {
    regionsData.value = [];
    confirmAnswer.value = true;
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

  it("painting over a pen-traced shape converts it to cells only when the DM confirms", async () => {
    const pen = makeRegion({ id: "r1", cells: ["1,1", "2,1"], vertices: SQUARE });
    confirmAnswer.value = false;
    const plan = usePlanPalette(computed(() => "site-1"));
    expect(await plan.confirmConvert(pen)).toBe(false);
    expect(updateRegionStub.mutateAsync).not.toHaveBeenCalled();
    expect(plan.undo.canUndo.value).toBe(false);

    confirmAnswer.value = true;
    expect(await plan.confirmConvert(pen)).toBe(true);
    expect(updateRegionStub.mutateAsync).toHaveBeenCalledWith({ id: "r1", update: expect.objectContaining({ vertices: null, cells: ["1,1", "2,1"] }) });
    await plan.undo.undo();
    expect(updateRegionStub.mutateAsync).toHaveBeenLastCalledWith({ id: "r1", update: expect.objectContaining({ vertices: SQUARE }) });
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

  it("starts a new zone with the chosen kind and a trimmed label, or none when blank, and makes it active", async () => {
    createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "z1" });
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.zoneKind.value = "hazard";
    plan.zoneLabel.value = "  Spore bloom ";
    await plan.startNewZone();
    expect(createRegionStub.mutateAsync).toHaveBeenLastCalledWith({ site_location_id: "site-1", region_role: "zone", zone_kind: "hazard", label: "Spore bloom" });
    expect(plan.activeRegionId.value).toBe("z1");
    createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "z2" });
    plan.zoneLabel.value = "   ";
    await plan.startNewZone();
    expect(createRegionStub.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ label: null }));
  });

  it("claims nothing for an empty floor selection", async () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    await plan.claimFloorRegion([]);
    expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
  });

  it("creates nothing without a site", async () => {
    const plan = usePlanPalette(computed(() => null));
    expect(await plan.startNewSpace()).toBeNull();
    await plan.claimFloorRegion(["0,0"]);
    expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
  });
});

describe("eraseFromRegions", () => {
  it("leaves out regions the stroke never reached", () => {
    const regions = [makeRegion({ id: "a", cells: ["0,0"] }), makeRegion({ id: "b", cells: ["5,5", "6,6"] })];
    expect([...eraseFromRegions(regions, new Set(["6,6"]))]).toEqual([["b", ["5,5"]]]);
  });
});
