// A focused regression test for `abandonGesture` (#884 review finding 2) —
// the one-line delegate to `useRegionPointer.abandonGesture` is otherwise
// invisible to any test: `useMapCanvasEditor.test.ts` mocks this whole
// module out, and `useRegionPointer.test.ts` only exercises the underlying
// gesture machinery directly, never through this module's own wiring. Built
// against a REAL `useRegionPointer` underneath (only `plan` and the
// geometry callbacks are faked), so this proves the actual production
// delegate, not a stand-in for it.
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { usePlanCanvasTools } from "./usePlanCanvasTools";
import { emptyLayers, type CellKey } from "@/types/dungeonMap.types";
import { canonicaliseEdge } from "@/cartographer/edges";
import { putWall } from "@/cartographer/testWalls";
import { useToast } from "@/composables/useToast";
import type { SourceEdgeKey } from "@/types/locationDoor.types";
import type { usePlanPalette } from "./usePlanPalette";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

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

function makeHarness() {
  const region = makeRegion();
  const commitCells = vi.fn();
  const plan = {
    regions: ref([region]),
    foundRegions: ref([]),
    ways: ref([]),
    planTool: ref("zone"),
    traceTool: ref("paint"),
    activeRegionId: ref("r1"),
    activeRegion: computed(() => region),
    commitCells,
    commitRing: vi.fn(async () => {}),
    commitTemplate: vi.fn(),
    confirmConvert: vi.fn(async () => true),
    assignArea: vi.fn(async () => {}),
    existingDoorAtEdge: vi.fn(() => null),
    placeDoorAt: vi.fn(),
    cycleDoorKind: vi.fn(),
    removeDoor: vi.fn(),
  } as unknown as ReturnType<typeof usePlanPalette>;

  const tools = usePlanCanvasTools({
    plan,
    layers: ref(emptyLayers()),
    // Identity mapping — a test can reason about plain coordinates.
    cellAt: (x, y) => `${x},${y}` as CellKey,
    gridPointAt: (x, y) => [x, y],
    worldPointAt: (x, y) => ({ x, y }),
    tilePixelSize: () => 32,
  });

  return { tools, plan, commitCells };
}

function down(x: number, y: number): PointerEvent {
  return new PointerEvent("pointerdown", { clientX: x, clientY: y });
}
function move(x: number, y: number): PointerEvent {
  return new PointerEvent("pointermove", { clientX: x, clientY: y });
}
function up(x: number, y: number): PointerEvent {
  return new PointerEvent("pointerup", { clientX: x, clientY: y });
}

describe("usePlanCanvasTools.abandonGesture (#884 review finding 2)", () => {
  it("abandons an in-flight Zone paint stroke so the stray pointerup does not commit it", () => {
    const { tools, commitCells } = makeHarness();

    tools.onPointerDown(down(0, 0));
    tools.onPointerMove(move(1, 1));

    tools.abandonGesture();

    // The window listener useRegionPointer attached is gone — this pointerup
    // is exactly the one the DM releases after switching layers.
    window.dispatchEvent(up(1, 1));

    expect(commitCells).not.toHaveBeenCalled();
  });

  it("is a harmless no-op when nothing is in flight (e.g. the Door/Assign tools, which have no gesture to abandon)", () => {
    const { tools } = makeHarness();
    expect(() => tools.abandonGesture()).not.toThrow();
  });
});

describe("usePlanCanvasTools Erase tool", () => {
  function eraseHarness() {
    const bound = makeRegion({ id: "room", space_location_id: "loc-1", cells: ["0,0", "1,0", "2,0"] as CellKey[] });
    const zone = makeRegion({ id: "zone", region_role: "zone", zone_kind: "hazard", cells: ["1,0", "5,5"] as CellKey[] });
    const eraseCells = vi.fn();
    const plan = {
      regions: ref([bound, zone]),
      foundRegions: ref([]),
      ways: ref([]),
      planTool: ref("erase"),
      traceTool: ref("paint"),
      activeRegionId: ref(null),
      activeRegion: computed(() => null),
      commitCells: vi.fn(),
      eraseCells,
    } as unknown as ReturnType<typeof usePlanPalette>;
    const tools = usePlanCanvasTools({
      plan,
      layers: ref(emptyLayers()),
      cellAt: (x, y) => `${x},${y}` as CellKey,
      gridPointAt: (x, y) => [x, y],
      worldPointAt: (x, y) => ({ x, y }),
      tilePixelSize: () => 32,
    });
    return { tools, eraseCells };
  }

  it("takes a dragged-over cell out of every region holding it, bound rooms included, previewed live", () => {
    const { tools, eraseCells } = eraseHarness();
    tools.onPointerDown(down(0, 0));
    window.dispatchEvent(move(1, 0));

    const preview = tools.renderScene().cellsOverride;
    expect(preview?.get("room")).toEqual(["2,0"]);
    expect(preview?.get("zone")).toEqual(["5,5"]);

    window.dispatchEvent(up(1, 0));
    expect(eraseCells).toHaveBeenCalledWith(new Set(["0,0", "1,0"]));
    expect(tools.renderScene().cellsOverride).toBeUndefined();
  });

  it("commits nothing for an erase drag that never touched the canvas", () => {
    const eraseCells = vi.fn();
    const plan = {
      regions: ref([]), ways: ref([]), planTool: ref("erase"), traceTool: ref("paint"),
      activeRegionId: ref(null), activeRegion: computed(() => null), commitCells: vi.fn(), eraseCells,
    } as unknown as ReturnType<typeof usePlanPalette>;
    const tools = usePlanCanvasTools({
      plan, layers: ref(emptyLayers()), cellAt: () => null, gridPointAt: (x, y) => [x, y],
      worldPointAt: (x, y) => ({ x, y }), tilePixelSize: () => 32,
    });
    tools.onPointerDown(down(0, 0));
    window.dispatchEvent(up(0, 0));
    expect(eraseCells).not.toHaveBeenCalled();
  });

  it("commits nothing when abandoned mid-stroke", () => {
    const { tools, eraseCells } = eraseHarness();
    tools.onPointerDown(down(0, 0));
    tools.abandonGesture();
    window.dispatchEvent(up(0, 0));
    expect(eraseCells).not.toHaveBeenCalled();
  });
});

describe("usePlanCanvasTools pan boundary", () => {
  it("leaves the middle and right buttons to the editor's pan", () => {
    const { tools } = makeHarness();
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, button: 1 }))).toBe(false);
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, button: 2 }))).toBe(false);
  });

  it("claims a Shift press like any other, since Shift no longer pans", () => {
    const { tools } = makeHarness();
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, shiftKey: true }))).toBe(true);
    tools.abandonGesture();
  });
});

describe("usePlanCanvasTools Door and Assign tools", () => {
  const TILE = 32;
  // The vertical edge between cell 2 and cell 3 on row 2: a pointer 1px off it, mid-row.
  const EDGE_POINT = { x: 3 * TILE + 1, y: 2 * TILE + TILE / 2 };
  const EDGE = "3,2:W" as SourceEdgeKey;
  const { toasts } = useToast();

  function doorHarness(
    tool: "door" | "assign",
    rooms: LocationMapRegion[] = [],
    floor: CellKey[] = [],
    siteRooms: { id: string; name: string }[] = [{ id: "loc-west", name: "West" }, { id: "loc-east", name: "East" }],
  ) {
    const armed = ref(false);
    const layers = ref(emptyLayers());
    for (const cell of floor) layers.value.floor[cell] = { floor: { pack_id: "base", pack_version: 1, variant: 0 } };
    const existing = ref<string | null>(null);
    const plan = {
      regions: ref(rooms),
      foundRegions: ref([]),
      ways: ref([]),
      planTool: ref(tool),
      traceTool: ref("paint"),
      activeRegionId: ref(null),
      activeRegion: computed(() => null),
      existingDoorAtEdge: vi.fn(() => existing.value),
      placeDoorAt: vi.fn(),
      placeArmedDoorOn: vi.fn(() => armed.value),
      askDoorEnds: vi.fn(),
      pendingDoorEdge: ref<SourceEdgeKey | null>(null),
      spaceOptions: ref(siteRooms),
      cycleDoorKind: vi.fn(),
      removeDoor: vi.fn(),
      assignArea: vi.fn(async () => {}),
    } as unknown as ReturnType<typeof usePlanPalette>;
    const tools = usePlanCanvasTools({
      plan,
      layers,
      cellAt: (x, y) => `${x},${y}` as CellKey,
      gridPointAt: (x, y) => [x, y],
      worldPointAt: (x, y) => ({ x, y }),
      tilePixelSize: () => TILE,
    });
    toasts.value = [];
    return { tools, plan, existing, armed, layers };
  }

  const roomsEitherSide = [
    makeRegion({ id: "west", space_location_id: "loc-west", cells: ["2,2"] as CellKey[] }),
    makeRegion({ id: "east", space_location_id: "loc-east", cells: ["3,2"] as CellKey[] }),
  ];
  const press = (over: PointerEventInit = {}) => new PointerEvent("pointerdown", { clientX: EDGE_POINT.x, clientY: EDGE_POINT.y, ...over });

  it("places a door on an edge joining the rooms traced either side of it", () => {
    const { tools, plan } = doorHarness("door", roomsEitherSide);
    expect(tools.onPointerDown(press())).toBe(true);
    expect(plan.placeDoorAt).toHaveBeenCalledTimes(1);
    const [edge, from, to] = vi.mocked(plan.placeDoorAt).mock.calls[0]!;
    expect(edge).toBe(EDGE);
    expect(new Set([from, to])).toEqual(new Set(["loc-west", "loc-east"]));
  });

  // #1195: the tool used to refuse this edge with "Trace a room on at least one side".
  it("asks which rooms a door joins where no zone is in reach, instead of refusing it", () => {
    const { tools, plan } = doorHarness("door", []);
    expect(tools.onPointerDown(press())).toBe(true);
    expect(plan.askDoorEnds).toHaveBeenCalledWith(EDGE);
    expect(plan.placeDoorAt).not.toHaveBeenCalled();
    expect(toasts.value).toHaveLength(0);
  });

  it("says so, and asks nothing, on a map with no rooms to choose from", () => {
    const { tools, plan } = doorHarness("door", [], [], []);
    tools.onPointerDown(press());
    expect(plan.askDoorEnds).not.toHaveBeenCalled();
    expect(toasts.value).toHaveLength(1);
  });

  it("puts a listed door on an edge with no zone beside it, asking nothing (it keeps its own ends)", () => {
    const { tools, plan, armed } = doorHarness("door", []);
    armed.value = true;
    tools.onPointerDown(press());
    expect(plan.placeArmedDoorOn).toHaveBeenCalledWith(EDGE);
    expect(plan.askDoorEnds).not.toHaveBeenCalled();
    expect(plan.placeDoorAt).not.toHaveBeenCalled();
  });

  it("a click on a placed door cycles it even while a listed door is armed", () => {
    const { tools, plan, existing, armed } = doorHarness("door", roomsEitherSide);
    existing.value = "door-1";
    armed.value = true;
    tools.onPointerDown(press());
    expect(plan.cycleDoorKind).toHaveBeenCalledWith("door-1");
    expect(plan.placeArmedDoorOn).not.toHaveBeenCalled();
  });

  it("keeps the edge waiting for its rooms lit while the pointer is elsewhere", () => {
    const { tools, plan } = doorHarness("door", []);
    plan.pendingDoorEdge.value = EDGE;
    expect(tools.renderScene().hoveredDoorEdge).toBe(EDGE);
  });

  it("cycles an existing door's kind on a plain click, and removes it only on Alt-click", () => {
    const { tools, plan, existing } = doorHarness("door", roomsEitherSide);
    existing.value = "door-1";
    tools.onPointerDown(press());
    expect(plan.cycleDoorKind).toHaveBeenCalledWith("door-1");
    expect(plan.removeDoor).not.toHaveBeenCalled();
    tools.onPointerDown(press({ altKey: true }));
    expect(plan.removeDoor).toHaveBeenCalledWith("door-1");
    expect(plan.placeDoorAt).not.toHaveBeenCalled();
  });

  it("Alt-click where there is no door places nothing", () => {
    const { tools, plan } = doorHarness("door", roomsEitherSide);
    tools.onPointerDown(press({ altKey: true }));
    expect(plan.placeDoorAt).not.toHaveBeenCalled();
    expect(plan.removeDoor).not.toHaveBeenCalled();
  });

  it("leaves a right-click to the pan unless Alt turns it into a delete, and swallows a press that finds no edge", () => {
    const { tools, plan, existing } = doorHarness("door", roomsEitherSide);
    existing.value = "door-1";
    expect(tools.onPointerDown(press({ button: 2 }))).toBe(false);
    expect(plan.removeDoor).not.toHaveBeenCalled();
    expect(tools.onPointerDown(press({ button: 2, altKey: true }))).toBe(true);
    expect(plan.removeDoor).toHaveBeenCalledWith("door-1");
    // Mid-tile, far from any edge: claimed so the click never reaches the Drawing underneath.
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 2 * TILE + 16, clientY: 2 * TILE + 16 }))).toBe(true);
  });

  it("assigns the whole connected floor under a click, not the separate patch beside it", () => {
    const { tools, plan } = doorHarness("assign", [], ["0,0", "1,0", "1,1", "8,8"] as CellKey[]);
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 0, clientY: 0 }))).toBe(true);
    expect(vi.mocked(plan.assignArea).mock.calls[0]![0].slice().sort()).toEqual(["0,0", "1,0", "1,1"]);
    // The floor path passes no outline of its own: the palette looks the found room's up.
    expect(vi.mocked(plan.assignArea).mock.calls[0]).toHaveLength(1);
  });

  it("assigns the ring of walls round an unpainted click, cells and outline together", () => {
    const { tools, plan, layers } = doorHarness("assign", []);
    // A 2x2 box of lattice walls: top, bottom, left and right edges of cells (0,0)..(1,1).
    for (const [x, y, side] of [[0, 0, "N"], [1, 0, "N"], [0, 1, "S"], [1, 1, "S"], [0, 0, "W"], [0, 1, "W"], [1, 0, "E"], [1, 1, "E"]] as const) {
      const o = canonicaliseEdge(x, y, side);
      putWall(layers.value, o.x, o.y, o.side, { pack_id: "base", pack_version: 1, variant: 0, type: "wall" });
    }
    // This harness reads pointer pixels as cell units, so (1,1) is the middle of the box and cell "1,1" has no floor.
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 1, clientY: 1 }))).toBe(true);
    const [cells, outline] = vi.mocked(plan.assignArea).mock.calls[0]!;
    expect(cells.slice().sort()).toEqual(["0,0", "0,1", "1,0", "1,1"]);
    expect(outline).toHaveLength(4);
    expect(toasts.value).toHaveLength(0);
  });

  it("says there is no ring when an unpainted click is inside no closed walls", () => {
    const { tools, plan } = doorHarness("assign", [], ["0,0"] as CellKey[]);
    tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 4 * TILE, clientY: 4 * TILE }));
    expect(plan.assignArea).not.toHaveBeenCalled();
    expect(toasts.value.map((t) => t.message)).toEqual(["Click inside a closed ring of walls, or on a painted floor."]);
  });

  it("says a ring smaller than a square has nothing to assign", () => {
    // A ring 0.8 cells across (0.6 to 1.4) holds no square middle, which would sit at 0.5 or 1.5.
    const { tools, plan, layers } = doorHarness("assign", []);
    layers.value.walls.a = { pack_id: "base", pack_version: 1, variant: 0, type: "wall", a: [0.6, 0.6], b: [1.4, 0.6] };
    layers.value.walls.b = { pack_id: "base", pack_version: 1, variant: 0, type: "wall", a: [1.4, 0.6], b: [1.4, 1.4] };
    layers.value.walls.c = { pack_id: "base", pack_version: 1, variant: 0, type: "wall", a: [1.4, 1.4], b: [0.6, 1.4] };
    layers.value.walls.d = { pack_id: "base", pack_version: 1, variant: 0, type: "wall", a: [0.6, 1.4], b: [0.6, 0.6] };
    // Click at (1,1): no floor there, and the point is inside the tiny ring.
    tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    expect(plan.assignArea).not.toHaveBeenCalled();
    expect(toasts.value.map((t) => t.message)).toEqual(["That ring of walls is smaller than a square, so there is nothing to assign."]);
  });

  it("leaves a right-click with the Assign tool to the pan", () => {
    const { tools, plan } = doorHarness("assign", [], ["0,0"] as CellKey[]);
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, button: 2 }))).toBe(false);
    expect(plan.assignArea).not.toHaveBeenCalled();
  });

  it("shows the hovered door edge only while the Door tool is the one in use", () => {
    const { tools, plan } = doorHarness("door", roomsEitherSide);
    tools.onPointerMove(new PointerEvent("pointermove", { clientX: EDGE_POINT.x, clientY: EDGE_POINT.y }));
    expect(tools.renderScene().hoveredDoorEdge).toBe(EDGE);
    tools.onPointerLeave();
    expect(tools.renderScene().hoveredDoorEdge).toBeNull();

    tools.onPointerMove(new PointerEvent("pointermove", { clientX: EDGE_POINT.x, clientY: EDGE_POINT.y }));
    plan.planTool.value = "assign";
    expect(tools.renderScene().hoveredDoorEdge).toBeNull();
    // Moving under another tool forgets the edge, so switching back does not show a stale one.
    tools.onPointerMove(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    plan.planTool.value = "door";
    expect(tools.renderScene().hoveredDoorEdge).toBeNull();
  });
});

// #1125 frame 19: a room the walls found has no row; the canvas still draws it and a click on it picks it.
describe("usePlanCanvasTools found rooms", () => {
  function foundHarness() {
    const found = makeRegion({ id: "found:s:0,0", cells: ["0,0", "1,0"] as CellKey[], derived_from: "floodfill" });
    const selectRegion = vi.fn();
    const plan = {
      regions: ref([]),
      foundRegions: ref([found]),
      ways: ref([]),
      planTool: ref("zone"),
      traceTool: ref("paint"),
      activeRegionId: ref(null),
      activeRegion: computed(() => null),
      selectRegion,
    } as unknown as ReturnType<typeof usePlanPalette>;
    const tools = usePlanCanvasTools({
      plan,
      layers: ref(emptyLayers()),
      cellAt: (x, y) => `${Math.floor(x / 32)},${Math.floor(y / 32)}` as CellKey,
      gridPointAt: (x, y) => [x, y],
      worldPointAt: (x, y) => ({ x, y }),
      tilePixelSize: () => 32,
    });
    return { tools, selectRegion };
  }

  it("draws a found room on the canvas beside the written rows", () => {
    const { tools } = foundHarness();
    expect(tools.renderScene().regions.map((r) => r.id)).toEqual(["found:s:0,0"]);
  });

  it("a click on a found room asks the palette to pick it, which is what writes its row", () => {
    const { tools, selectRegion } = foundHarness();
    tools.onPointerDown(down(4, 4));
    window.dispatchEvent(up(4, 4));
    expect(selectRegion).toHaveBeenCalledWith("found:s:0,0");
  });
});
