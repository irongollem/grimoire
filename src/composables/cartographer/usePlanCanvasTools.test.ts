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
    ways: ref([]),
    planTool: ref("space"),
    traceTool: ref("paint"),
    activeRegionId: ref("r1"),
    activeRegion: computed(() => region),
    commitCells,
    commitRing: vi.fn(async () => {}),
    commitTemplate: vi.fn(),
    confirmConvert: vi.fn(async () => true),
    claimFloorRegion: vi.fn(async () => {}),
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
  it("abandons an in-flight Space paint stroke so the stray pointerup does not commit it", () => {
    const { tools, commitCells } = makeHarness();

    tools.onPointerDown(down(0, 0));
    tools.onPointerMove(move(1, 1));

    tools.abandonGesture();

    // The window listener useRegionPointer attached is gone — this pointerup
    // is exactly the one the DM releases after switching layers.
    window.dispatchEvent(up(1, 1));

    expect(commitCells).not.toHaveBeenCalled();
  });

  it("is a harmless no-op when nothing is in flight (e.g. the Door/Claim tools, which have no gesture to abandon)", () => {
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

describe("usePlanCanvasTools Door and Claim tools", () => {
  const TILE = 32;
  // The vertical edge between cell 2 and cell 3 on row 2: a pointer 1px off it, mid-row.
  const EDGE_POINT = { x: 3 * TILE + 1, y: 2 * TILE + TILE / 2 };
  const EDGE = "3,2:W" as SourceEdgeKey;
  const { toasts } = useToast();

  function doorHarness(tool: "door" | "claim", rooms: LocationMapRegion[] = [], floor: CellKey[] = []) {
    const layers = ref(emptyLayers());
    for (const cell of floor) layers.value.floor[cell] = { floor: { pack_id: "base", pack_version: 1, variant: 0 } };
    const existing = ref<string | null>(null);
    const plan = {
      regions: ref(rooms),
      ways: ref([]),
      planTool: ref(tool),
      traceTool: ref("paint"),
      activeRegionId: ref(null),
      activeRegion: computed(() => null),
      existingDoorAtEdge: vi.fn(() => existing.value),
      placeDoorAt: vi.fn(),
      cycleDoorKind: vi.fn(),
      removeDoor: vi.fn(),
      claimFloorRegion: vi.fn(async () => {}),
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
    return { tools, plan, existing };
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

  it("refuses a door where no room is traced, and says so", () => {
    const { tools, plan } = doorHarness("door", []);
    expect(tools.onPointerDown(press())).toBe(true);
    expect(plan.placeDoorAt).not.toHaveBeenCalled();
    expect(toasts.value).toHaveLength(1);
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

  it("claims the whole connected floor under a click, not the separate patch beside it", () => {
    const { tools, plan } = doorHarness("claim", [], ["0,0", "1,0", "1,1", "8,8"] as CellKey[]);
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 0, clientY: 0 }))).toBe(true);
    expect(vi.mocked(plan.claimFloorRegion).mock.calls[0]![0].slice().sort()).toEqual(["0,0", "1,0", "1,1"]);
  });

  it("will not claim an unpainted cell, and tells the DM", () => {
    const { tools, plan } = doorHarness("claim", [], ["0,0"] as CellKey[]);
    tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 4, clientY: 4 }));
    expect(plan.claimFloorRegion).not.toHaveBeenCalled();
    expect(toasts.value).toHaveLength(1);
  });

  it("leaves a right-click with the Claim tool to the pan", () => {
    const { tools, plan } = doorHarness("claim", [], ["0,0"] as CellKey[]);
    expect(tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, button: 2 }))).toBe(false);
    expect(plan.claimFloorRegion).not.toHaveBeenCalled();
  });

  it("shows the hovered door edge only while the Door tool is the one in use", () => {
    const { tools, plan } = doorHarness("door", roomsEitherSide);
    tools.onPointerMove(new PointerEvent("pointermove", { clientX: EDGE_POINT.x, clientY: EDGE_POINT.y }));
    expect(tools.renderScene().hoveredDoorEdge).toBe(EDGE);
    tools.onPointerLeave();
    expect(tools.renderScene().hoveredDoorEdge).toBeNull();

    tools.onPointerMove(new PointerEvent("pointermove", { clientX: EDGE_POINT.x, clientY: EDGE_POINT.y }));
    plan.planTool.value = "claim";
    expect(tools.renderScene().hoveredDoorEdge).toBeNull();
    // Moving under another tool forgets the edge, so switching back does not show a stale one.
    tools.onPointerMove(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    plan.planTool.value = "door";
    expect(tools.renderScene().hoveredDoorEdge).toBeNull();
  });
});
