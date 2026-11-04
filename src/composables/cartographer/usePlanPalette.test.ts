// #884 review findings 4 and 5 — regression coverage for `usePlanPalette.ts`.
// Every data-fetching/mutation composable it touches is mocked out (the same
// approach `MapWorkbench.test.ts` already uses for the same composables),
// with just enough control to simulate the two races the review found:
//
// - Finding 4: two commits fired back to back, before the first's query
//   invalidation has actually landed, used to both read the same stale
//   `before` off `regions.value` — so undoing the second silently reverted
//   the first too.
// - Finding 5: `fillFloorRegion` always inserted a new region, so claiming
//   the same floor twice (or floor already traced as a Space) made two
//   overlapping rows.
import { computed, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eraseFromRegions, usePlanPalette } from "./usePlanPalette";
import type { DerivedSpace } from "@/cartographer/structure.types";
import type { CellKey } from "@/types/dungeonMap.types";
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
const { childLocations } = vi.hoisted(() => ({ childLocations: { value: [] as { id: string; name: string }[] } }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocations: () => ({ data: childLocations }) }));

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

  describe("fillFloorRegion: no overlapping duplicates (finding 5)", () => {
    it("selects an existing space that already covers the claimed floor instead of duplicating it", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "0,1"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.fillFloorRegion(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("selects an existing space on a partial overlap too — floor already traced by hand", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["0,0", "0,1", "0,2"] })];
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.fillFloorRegion(["0,0", "0,1", "0,2", "0,3"]); // the flood fill found one more cell than the hand trace

      expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
      expect(plan.activeRegionId.value).toBe("existing");
    });

    it("still creates a genuinely new region when nothing covers it, as the walls' own room so Find again may redraw it", async () => {
      regionsData.value = [makeRegion({ id: "existing", region_role: "space", cells: ["5,5"] })];
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region", cells: ["0,0", "0,1"], region_role: "space" });
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.fillFloorRegion(["0,0", "0,1"]);

      expect(createRegionStub.mutateAsync).toHaveBeenCalledOnce();
      expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ region_role: "space", derived_from: "floodfill" }));
    });

    // Pouring a zone up to the walls must give it the walls' own line, or a round chapel is filled as a staircase.
    it("gives the poured room the outline of the found room that holds exactly those squares", async () => {
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region" });
      const chapel: DerivedSpace = { key: "s:0,0", cells: ["0,0", "0,1"], signature: "sig", outline: [[0, 0], [1, 0], [1, 2]], name: null, nameSource: null };
      const plan = usePlanPalette(computed(() => "site-1"), () => [chapel]);
      await plan.fillFloorRegion(["0,1", "0,0"]);
      expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ vertices: chapel.outline }));
    });

    it("leaves the outline off when no found room has exactly those squares", async () => {
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region" });
      const chapel: DerivedSpace = { key: "s:0,0", cells: ["0,0", "0,1", "0,2"], signature: "sig", outline: [[0, 0], [1, 0], [1, 2]], name: null, nameSource: null };
      const plan = usePlanPalette(computed(() => "site-1"), () => [chapel]);
      await plan.fillFloorRegion(["0,0", "0,1"]);
      expect(createRegionStub.mutateAsync.mock.calls[0]![0]).not.toHaveProperty("vertices");
      // ...and the other way: a poured area bigger than the room is not that room either.
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region-2" });
      const small: DerivedSpace = { ...chapel, cells: ["0,0", "0,1"] };
      const plan2 = usePlanPalette(computed(() => "site-1"), () => [small]);
      await plan2.fillFloorRegion(["0,0", "0,1", "0,2"]);
      expect(createRegionStub.mutateAsync.mock.calls[1]![0]).not.toHaveProperty("vertices");
    });

    it("ignores a zone that happens to cover the same cells — only an existing space counts", async () => {
      regionsData.value = [makeRegion({ id: "zone-1", region_role: "zone", cells: ["0,0", "0,1"] })];
      createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "new-region", cells: ["0,0", "0,1"], region_role: "space" });
      const plan = usePlanPalette(computed(() => "site-1"));

      await plan.fillFloorRegion(["0,0", "0,1"]);

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
    await plan.fillFloorRegion([]);
    expect(createRegionStub.mutateAsync).not.toHaveBeenCalled();
  });

  it("creates nothing without a site", async () => {
    const plan = usePlanPalette(computed(() => null));
    expect(await plan.startNew()).toBeNull();
    await plan.fillFloorRegion(["0,0"]);
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
    plan.placeDoorAt("2,3:N", "crypt", "gallery");
    expect(updateDoorStub.calls.map((c) => c.vars)).toEqual([{ id: "door-1", update: { edge_key: "2,3:N" } }]);
    expect(createDoorStub.mutate).not.toHaveBeenCalled();
  });

  it("only the first edge takes it: the one after is a new door", () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.armDoorPlacement("door-1");
    plan.placeDoorAt("2,3:N", "crypt", "gallery");
    plan.placeDoorAt("5,5:W", "crypt", null);
    expect(createDoorStub.mutate).toHaveBeenCalledTimes(1);
  });

  it("choosing another tool lets the door go", async () => {
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.armDoorPlacement("door-1");
    await nextTick();
    plan.planTool.value = "zone";
    await nextTick();
    plan.placeDoorAt("2,3:N", "crypt", "gallery");
    expect(updateDoorStub.mutate).not.toHaveBeenCalled();
    expect(createDoorStub.mutate).toHaveBeenCalledTimes(1);
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

  it("filling with a zone kind pours a zone even over a room, and is the DM's ink", async () => {
    regionsData.value = [makeRegion({ id: "room", cells: ["0,0", "0,1"] })];
    createRegionStub.mutateAsync.mockResolvedValueOnce({ id: "z" });
    const plan = usePlanPalette(computed(() => "site-1"));
    plan.zoneKind.value = "hazard";
    await plan.fillFloorRegion(["0,0", "0,1"]);
    expect(createRegionStub.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ region_role: "zone", zone_kind: "hazard", derived_from: "dm", cells: ["0,0", "0,1"] }),
    );
  });
});
