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
import type { DoorSite } from "./usePlanPalette";
import type { SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";
import type { WallEdge } from "@/types/dungeonMap.types";
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
    brushRadius: ref(0.75),
    activeRegionId: ref("r1"),
    activeRegion: computed(() => region),
    commitCells,
    regionStateNow: vi.fn(() => ({ vertices: region.vertices, cells: region.cells })),
    commitRing: vi.fn(async () => {}),
    commitTemplate: vi.fn(),
    assignArea: vi.fn(async () => {}),
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
  it("abandons an in-flight Zone brush stroke so the stray pointerup does not commit it", () => {
    const { tools, plan, commitCells } = makeHarness();

    tools.onPointerDown(down(0, 0));
    tools.onPointerMove(move(1, 1));

    tools.abandonGesture();

    // The window listener useRegionPointer attached is gone — this pointerup
    // is exactly the one the DM releases after switching layers.
    window.dispatchEvent(up(1, 1));

    expect(commitCells).not.toHaveBeenCalled();
    expect(plan.commitRing).not.toHaveBeenCalled();
  });

  it("builds a brush stroke on the shape the palette last wrote, not on the row a refetch has yet to bring", () => {
    const { tools, plan } = makeHarness();
    // The row still says "no shape" (the first stroke's refetch has not landed); the palette knows the first stroke
    // left a 6 by 6 square. A second stroke on its right edge must keep that square.
    vi.mocked(plan.regionStateNow).mockReturnValue({ vertices: [[0, 0], [6, 0], [6, 6], [0, 6]], cells: [] });

    tools.onPointerDown(down(6, 3));
    window.dispatchEvent(up(6, 3));

    const ring = vi.mocked(plan.commitRing).mock.calls[0]![1];
    expect(Math.min(...ring.map((p) => p[0]))).toBeLessThan(0.5);
    expect(Math.max(...ring.map((p) => p[0]))).toBeGreaterThan(6.3);
  });

  it("is a harmless no-op when nothing is in flight (e.g. the Door/Assign tools, which have no gesture to abandon)", () => {
    const { tools } = makeHarness();
    expect(() => tools.abandonGesture()).not.toThrow();
  });
});

describe("usePlanCanvasTools stroke preview (#1197)", () => {
  it("shows a lasso in flight as an open tracing ring and a brush stroke as a closed one, and neither after release", () => {
    const { tools, plan } = makeHarness();

    plan.traceTool.value = "lasso";
    tools.onPointerDown(down(0, 0));
    window.dispatchEvent(move(4, 0));
    expect(tools.renderScene()).toMatchObject({ tracingRing: [[0, 0], [4, 0]], tracingClosed: false });
    window.dispatchEvent(up(4, 0));
    expect(tools.renderScene().tracingRing).toBeNull();

    plan.traceTool.value = "paint";
    tools.onPointerDown(down(10, 10));
    const scene = tools.renderScene();
    expect(scene.tracingClosed).toBe(true);
    expect(scene.tracingRing?.length).toBeGreaterThan(3);
    window.dispatchEvent(up(10, 10));
    expect(tools.renderScene().tracingRing).toBeNull();
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

describe("usePlanCanvasTools Assign tool", () => {
  const TILE = 32;
  const { toasts } = useToast();

  function doorHarness(tool: "assign", rooms: LocationMapRegion[] = [], floor: CellKey[] = []) {
    const layers = ref(emptyLayers());
    for (const cell of floor) layers.value.floor[cell] = { floor: { pack_id: "base", pack_version: 1, variant: 0 } };
    const plan = {
      regions: ref(rooms),
      foundRegions: ref([]),
      ways: ref([]),
      planTool: ref(tool),
      zoneKind: ref("room"),
      traceTool: ref("paint"),
      activeRegionId: ref(null),
      activeRegion: computed(() => null),
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
    return { tools, plan, layers };
  }

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

  describe("the Assign hover", () => {
    const hoverAt = (tools: ReturnType<typeof usePlanCanvasTools>, x: number, y: number) =>
      tools.onPointerMove(new PointerEvent("pointermove", { clientX: x, clientY: y }));
    const box2x2 = (layers: ReturnType<typeof doorHarness>["layers"]) => {
      for (const [x, y, side] of [[0, 0, "N"], [1, 0, "N"], [0, 1, "S"], [1, 1, "S"], [0, 0, "W"], [0, 1, "W"], [1, 0, "E"], [1, 1, "E"]] as const) {
        const o = canonicaliseEdge(x, y, side);
        putWall(layers.value, o.x, o.y, o.side, { pack_id: "base", pack_version: 1, variant: 0, type: "wall" });
      }
    };

    it("lights the connected floor under the pointer by its squares, not the separate patch beside it", () => {
      // Floor 0,0 1,0 1,1 is one patch (4-connected); 8,8 is another. Pointer on 1,0 lights the first three only.
      const { tools } = doorHarness("assign", [], ["0,0", "1,0", "1,1", "8,8"] as CellKey[]);
      hoverAt(tools, 1, 0);
      const hover = tools.renderScene().assignHover!;
      expect(hover.cells.slice().sort()).toEqual(["0,0", "1,0", "1,1"]);
      expect(hover.outline).toBeNull();
    });

    it("lights the ring of walls round the pointer with its squares and outline where no floor is painted", () => {
      // A 2x2 box covers squares 0,0 0,1 1,0 1,1; its outline has four corners. The pointer (1,1) is inside it.
      const { tools, layers } = doorHarness("assign", []);
      box2x2(layers);
      hoverAt(tools, 1, 1);
      const hover = tools.renderScene().assignHover!;
      expect(hover.cells.slice().sort()).toEqual(["0,0", "0,1", "1,0", "1,1"]);
      expect(hover.outline).toHaveLength(4);
    });

    it("lights nothing outside every ring", () => {
      const { tools, layers } = doorHarness("assign", []);
      box2x2(layers);
      hoverAt(tools, 1, 1);
      hoverAt(tools, 6, 6);
      expect(tools.renderScene().assignHover).toBeNull();
    });

    it("lights nothing over floor that is already a room, where a click only selects it", () => {
      const room = makeRegion({ id: "r", cells: ["0,0", "1,0"] as CellKey[] });
      const { tools } = doorHarness("assign", [room], ["0,0", "1,0", "5,5"] as CellKey[]);
      hoverAt(tools, 1, 0);
      expect(tools.renderScene().assignHover).toBeNull();
      // The patch beside it is not a room, so it still lights: the rule is about the covered area, not the tool.
      hoverAt(tools, 5, 5);
      expect(tools.renderScene().assignHover!.cells).toEqual(["5,5"]);
    });

    it("lights nothing over a ring whose squares are already a room", () => {
      const room = makeRegion({ id: "r", cells: ["0,0", "0,1", "1,0", "1,1"] as CellKey[] });
      const { tools, layers } = doorHarness("assign", [room]);
      box2x2(layers);
      hoverAt(tools, 1, 1);
      expect(tools.renderScene().assignHover).toBeNull();
    });

    it("lights a room for any other kind, since a click there makes a zone over it, and follows the kind as it changes", () => {
      const room = makeRegion({ id: "r", cells: ["0,0", "0,1", "1,0", "1,1"] as CellKey[] });
      const { tools, layers, plan } = doorHarness("assign", [room]);
      box2x2(layers);
      plan.zoneKind.value = "hazard";
      hoverAt(tools, 1, 1);
      expect(tools.renderScene().assignHover!.cells).toHaveLength(4);
      // Back to Room with the pointer still in the same ring: the click would only select it again.
      plan.zoneKind.value = "room";
      hoverAt(tools, 1, 1);
      expect(tools.renderScene().assignHover).toBeNull();
    });

    it("lights nothing over a ring too small to hold a square", () => {
      const { tools, layers } = doorHarness("assign", []);
      layers.value.walls.a = { pack_id: "base", pack_version: 1, variant: 0, type: "wall", a: [0.6, 0.6], b: [1.4, 0.6] };
      layers.value.walls.b = { pack_id: "base", pack_version: 1, variant: 0, type: "wall", a: [1.4, 0.6], b: [1.4, 1.4] };
      layers.value.walls.c = { pack_id: "base", pack_version: 1, variant: 0, type: "wall", a: [1.4, 1.4], b: [0.6, 1.4] };
      layers.value.walls.d = { pack_id: "base", pack_version: 1, variant: 0, type: "wall", a: [0.6, 1.4], b: [0.6, 0.6] };
      hoverAt(tools, 1, 1);
      expect(tools.renderScene().assignHover).toBeNull();
    });

    it("clears when the pointer leaves the canvas", () => {
      const { tools } = doorHarness("assign", [], ["0,0"] as CellKey[]);
      hoverAt(tools, 0, 0);
      expect(tools.renderScene().assignHover).not.toBeNull();
      tools.onPointerLeave();
      expect(tools.renderScene().assignHover).toBeNull();
    });

    it("clears the moment the tool changes, so Zone never draws under a stale amber area", () => {
      const { tools, plan } = doorHarness("assign", [], ["0,0"] as CellKey[]);
      hoverAt(tools, 0, 0);
      plan.planTool.value = "zone";
      expect(tools.renderDeps.assignHover.value).toBeNull();
    });

    it("clears after a click makes the area a room", () => {
      const { tools } = doorHarness("assign", [], ["0,0"] as CellKey[]);
      hoverAt(tools, 0, 0);
      tools.onPointerDown(new PointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
      expect(tools.renderDeps.assignHover.value).toBeNull();
    });

    it("does not work the area out again while the pointer stays in the same floor patch or the same ring", () => {
      // Same object back means nothing was recomputed (a recompute builds a new one).
      const floor = doorHarness("assign", [], ["0,0", "1,0"] as CellKey[]);
      hoverAt(floor.tools, 0, 0);
      const lit = floor.tools.renderScene().assignHover;
      hoverAt(floor.tools, 1, 0);
      expect(floor.tools.renderScene().assignHover).toBe(lit);

      const ringed = doorHarness("assign", []);
      box2x2(ringed.layers);
      hoverAt(ringed.tools, 1, 1);
      const ringLit = ringed.tools.renderScene().assignHover;
      hoverAt(ringed.tools, 0.5, 1.5);
      expect(ringed.tools.renderScene().assignHover).toBe(ringLit);
    });

    it("stops lighting a floor patch once a room is written over it, though the pointer stays in the patch", () => {
      const { tools, plan } = doorHarness("assign", [], ["0,0", "1,0"] as CellKey[]);
      hoverAt(tools, 0, 0);
      expect(tools.renderScene().assignHover).not.toBeNull();
      (plan.regions as unknown as { value: LocationMapRegion[] }).value = [makeRegion({ id: "new", cells: ["0,0", "1,0"] as CellKey[] })];
      hoverAt(tools, 1, 0);
      expect(tools.renderScene().assignHover).toBeNull();
    });

    it("works the area out again once the walls change under a stationary pointer", () => {
      const { tools, layers } = doorHarness("assign", []);
      box2x2(layers);
      hoverAt(tools, 1, 1);
      expect(tools.renderScene().assignHover).not.toBeNull();
      layers.value = { ...layers.value, walls: {} };
      hoverAt(tools, 1, 1);
      expect(tools.renderScene().assignHover).toBeNull();
    });
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

// #1197 frame 06: the Door tool lights and cuts a door-wide stretch of whatever wall is under the pointer.
describe("usePlanCanvasTools Door tool", () => {
  const TILE = 32;
  const { toasts } = useToast();
  const MATERIAL = { pack_id: "stone", pack_version: 1, variant: 0 };
  const wall = (a: [number, number], b: [number, number], over: Partial<WallEdge> = {}): WallEdge => ({ ...MATERIAL, type: "wall", a, b, ...over });
  // A slanted wall 10 cells long, direction (0.6, 0.8): one cell along it is (0.6, 0.8).
  const SLANTED = wall([10, 10], [16, 18]);
  // Its midpoint (13,14) has the owner side at cell 12,14 (m + 0.5n with n = (-0.8, 0.6)) and the other at 13,13.
  const roomsEitherSide = [
    makeRegion({ id: "ra", space_location_id: "loc-a", cells: ["12,14"] as CellKey[] }),
    makeRegion({ id: "rb", space_location_id: "loc-b", cells: ["13,13"] as CellKey[] }),
  ];
  const NAMES: [string, string][] = [["loc-a", "Nave"], ["loc-b", "Crypt"]];
  const ROOMS = [{ id: "loc-a", name: "Nave" }, { id: "loc-b", name: "Crypt" }];

  const way = (over: Partial<SiteDoorWithSpaces>): SiteDoorWithSpaces =>
    ({ id: "way-1", from_location_id: "loc-a", to_location_id: "loc-b", door_kind: "door", edge_key: null, segment: null, ...over }) as SiteDoorWithSpaces;

  function harness(opts: { regions?: LocationMapRegion[]; ways?: SiteDoorWithSpaces[]; walls?: Record<string, WallEdge>; rooms?: { id: string; name: string }[] } = {}) {
    const layers = ref(emptyLayers());
    layers.value.walls = opts.walls ?? { w: SLANTED };
    const armed = ref(false);
    const ways = ref(opts.ways ?? []);
    const plan = {
      regions: ref(opts.regions ?? []),
      foundRegions: ref([]),
      ways,
      planTool: ref("door"),
      traceTool: ref("paint"),
      activeRegionId: ref(null),
      activeRegion: computed(() => null),
      zoneKind: ref("room"),
      spaceNames: ref(new Map(NAMES)),
      spaceOptions: ref(opts.rooms ?? ROOMS),
      doorWidth: ref<1 | 2>(1),
      newDoorKind: ref("door"),
      pendingDoor: ref<DoorSite | null>(null),
      placeDoorAt: vi.fn(),
      placeArmedDoorOn: vi.fn(() => armed.value),
      askDoorEnds: vi.fn(),
      cycleDoorKind: vi.fn(),
      removeDoor: vi.fn(),
    } as unknown as ReturnType<typeof usePlanPalette>;
    const tools = usePlanCanvasTools({
      plan,
      layers,
      cellAt: (x, y) => `${Math.floor(x / TILE)},${Math.floor(y / TILE)}` as CellKey,
      // The real canvas maps a pointer to cell units like this, and to world pixels as is.
      gridPointAt: (x, y) => [x / TILE, y / TILE],
      worldPointAt: (x, y) => ({ x, y }),
      tilePixelSize: () => TILE,
    });
    toasts.value = [];
    return { tools, plan, armed, layers, ways };
  }

  const at = (cx: number, cy: number, init: PointerEventInit = {}, type = "pointerdown") =>
    new PointerEvent(type, { clientX: cx * TILE, clientY: cy * TILE, ...init });
  const hover = (tools: ReturnType<typeof usePlanCanvasTools>, cx: number, cy: number) => tools.onPointerMove(at(cx, cy, {}, "pointermove"));
  const expectSegment = (actual: readonly (readonly number[])[] | null, expected: number[][]) => {
    expect(actual).not.toBeNull();
    expected.forEach((point, i) => point.forEach((v, j) => expect(actual![i]![j]).toBeCloseTo(v, 9)));
  };

  describe("what the pointer finds", () => {
    it("prefers a placed door over a wall over a bare grid edge", () => {
      // The pointer is on the way (a grid edge door at x=13) and 0.08 from the slanted wall, so both are in reach.
      const placed = way({ edge_key: "13,13:W" });
      const { tools, ways } = harness({ ways: [placed] });
      hover(tools, 13, 13.9);
      expectSegment(tools.renderScene().hoveredDoor, [[13, 14], [13, 13]]);
      ways.value = [];
      hover(tools, 13, 13.9);
      // The wall now: a door-wide stretch of the slanted wall (0.6 across, 0.8 down), not the grid edge.
      const stretch = tools.renderScene().hoveredDoor!;
      expect(Math.hypot(stretch[1][0] - stretch[0][0], stretch[1][1] - stretch[0][1])).toBeCloseTo(1, 9);
      expect(stretch[1][0]).not.toBe(stretch[0][0]);
      // Far from every wall: the nearest grid edge, x = 20.
      hover(tools, 20, 3.5);
      expectSegment(tools.renderScene().hoveredDoor, [[20, 4], [20, 3]]);
    });

    it("lights a door-wide stretch of a slanted wall centred on the pointer's foot point", () => {
      const { tools } = harness();
      hover(tools, 13, 14);
      // The foot is the wall's midpoint (13,14); half a cell either way along (0.6, 0.8) is (0.3, 0.4).
      expectSegment(tools.renderScene().hoveredDoor, [[12.7, 13.6], [13.3, 14.4]]);
    });

    it("doubles the stretch at 10 ft on a slanted wall, and leaves a grid wall as its one 5 ft edge", () => {
      const slanted = harness();
      slanted.plan.doorWidth.value = 2;
      hover(slanted.tools, 13, 14);
      expectSegment(slanted.tools.renderScene().hoveredDoor, [[12.4, 13.2], [13.6, 14.8]]);

      const grid = harness({ walls: { "5,5:N": wall([5, 5], [6, 5]) } });
      grid.plan.doorWidth.value = 2;
      hover(grid.tools, 5.5, 5.05);
      expectSegment(grid.tools.renderScene().hoveredDoor, [[5, 5], [6, 5]]);
    });

    it("lights a grid wall as the edge's own line, not the wall's stored direction, so the rooms either side do not swap", () => {
      // A W wall is stored top to bottom, (3,2) to (3,3); the edge's line runs bottom to top, which is the direction
      // that puts the owner cell (3,2) on the "from" side.
      const grid = harness({ walls: { "3,2:W": wall([3, 2], [3, 3]) } });
      hover(grid.tools, 3.05, 2.5);
      expectSegment(grid.tools.renderScene().hoveredDoor, [[3, 3], [3, 2]]);
    });

    it("gives the whole of a wall that is shorter than the door, and keeps the stretch inside the wall near its end", () => {
      const short = harness({ walls: { s: wall([0, 0], [0.6, 0]) } });
      hover(short.tools, 0.3, 0.05);
      expectSegment(short.tools.renderScene().hoveredDoor, [[0, 0], [0.6, 0]]);

      // Pointing 0.1 from the end of a 10 long wall: the door is shifted in to start at the wall, not hang off it.
      const long = harness({ walls: { l: wall([0, 0], [10, 0]) } });
      hover(long.tools, 0.1, 0.05);
      expectSegment(long.tools.renderScene().hoveredDoor, [[0, 0], [1, 0]]);
    });

    it("only cuts a plain wall: a door already in the wall is not a place to cut another", () => {
      const { tools } = harness({ walls: { d: wall([0, 0], [10, 0], { type: "doorClosed" }) } });
      hover(tools, 5.4, 0.05);
      // No wall target, so the pointer 0.05 cells off the grid edge y = 0 lights that whole edge. (Treated as a wall it
      // would have lit a stretch centred on 5.4, from 4.9 to 5.9.)
      expectSegment(tools.renderScene().hoveredDoor, [[5, 0], [6, 0]]);
    });

    it("lights only under the Door tool, forgets on leave, and does not keep a stale line when the tool changes", () => {
      const { tools, plan } = harness();
      hover(tools, 13, 14);
      expect(tools.renderScene().hoveredDoor).not.toBeNull();
      tools.onPointerLeave();
      expect(tools.renderScene().hoveredDoor).toBeNull();
      hover(tools, 13, 14);
      plan.planTool.value = "assign";
      expect(tools.renderScene().hoveredDoor).toBeNull();
      tools.onPointerMove(at(0, 0, {}, "pointermove"));
      plan.planTool.value = "door";
      expect(tools.renderScene().hoveredDoor).toBeNull();
    });

    it("keeps the line waiting for its rooms lit while the pointer is elsewhere", () => {
      const { tools, plan } = harness();
      plan.pendingDoor.value = { kind: "wall", wallId: "w", from: [12.7, 13.6], to: [13.3, 14.4] };
      expectSegment(tools.renderScene().hoveredDoor, [[12.7, 13.6], [13.3, 14.4]]);
    });
  });

  describe("the tip", () => {
    it("names the two rooms the door would join, the one it would leave, or says there are none", () => {
      const both = harness({ regions: roomsEitherSide });
      hover(both.tools, 13, 14);
      expect(both.tools.doorTip.value).toBe("Door here: Nave and Crypt");

      const one = harness({ regions: [roomsEitherSide[0]!] });
      hover(one.tools, 13, 14);
      expect(one.tools.doorTip.value).toBe("Door here: Nave, leading nowhere yet");

      const none = harness();
      hover(none.tools, 13, 14);
      expect(none.tools.doorTip.value).toBe("No room beside this wall yet. You will be asked which rooms it joins.");
    });

    it("names the rooms of a placed door and what a click and Alt-click do", () => {
      const { tools, ways } = harness({ ways: [way({ edge_key: "13,13:W" })] });
      hover(tools, 13, 13.9);
      expect(tools.doorTip.value).toBe("Nave to Crypt. Click to switch door and arch, Alt-click to remove.");
      ways.value = [way({ edge_key: "13,13:W", to_location_id: null })];
      hover(tools, 13, 13.9);
      expect(tools.doorTip.value).toBe("Nave, leading nowhere yet. Click to switch door and arch, Alt-click to remove.");
    });

    it("says nothing with nothing under the pointer", () => {
      const { tools } = harness();
      hover(tools, 3.5, 3.5);
      expect(tools.doorTip.value).toBeNull();
    });
  });

  describe("a click", () => {
    it("on a wall puts the door on that stretch of it, joining the rooms either side", () => {
      const { tools, plan } = harness({ regions: roomsEitherSide });
      expect(tools.onPointerDown(at(13, 14))).toBe(true);
      expect(plan.placeDoorAt).toHaveBeenCalledTimes(1);
      const [site, from, to] = vi.mocked(plan.placeDoorAt).mock.calls[0]!;
      expect(site).toMatchObject({ kind: "wall", wallId: "w" });
      if (site.kind !== "wall") throw new Error("a wall site");
      expectSegment([site.from, site.to], [[12.7, 13.6], [13.3, 14.4]]);
      expect([from, to]).toEqual(["loc-a", "loc-b"]);
    });

    it("on a wall with no room in reach asks which rooms, naming the wall to cut only on the answer", () => {
      const { tools, plan } = harness();
      tools.onPointerDown(at(13, 14));
      expect(plan.askDoorEnds).toHaveBeenCalledTimes(1);
      expect(vi.mocked(plan.askDoorEnds).mock.calls[0]![0]).toMatchObject({ kind: "wall", wallId: "w" });
      expect(plan.placeDoorAt).not.toHaveBeenCalled();
      expect(toasts.value).toHaveLength(0);
    });

    it("on a map with no rooms to choose from says so and cuts nothing", () => {
      const { tools, plan } = harness({ rooms: [] });
      tools.onPointerDown(at(13, 14));
      expect(plan.askDoorEnds).not.toHaveBeenCalled();
      expect(plan.placeDoorAt).not.toHaveBeenCalled();
      expect(toasts.value).toHaveLength(1);
    });

    it("on a wall puts an armed listed door there, asking nothing", () => {
      const { tools, plan, armed } = harness();
      armed.value = true;
      tools.onPointerDown(at(13, 14));
      expect(vi.mocked(plan.placeArmedDoorOn).mock.calls[0]![0]).toMatchObject({ kind: "wall", wallId: "w" });
      expect(plan.askDoorEnds).not.toHaveBeenCalled();
      expect(plan.placeDoorAt).not.toHaveBeenCalled();
    });

    it("on a bare grid edge writes the way alone, as before, once the press is released", () => {
      const { tools, plan } = harness({ regions: [
        makeRegion({ id: "west", space_location_id: "loc-a", cells: ["19,3"] as CellKey[] }),
        makeRegion({ id: "east", space_location_id: "loc-b", cells: ["20,3"] as CellKey[] }),
      ] });
      expect(tools.onPointerDown(at(20, 3.5))).toBe(true);
      // Nothing yet: the press might still become a drag across an opening.
      expect(plan.placeDoorAt).not.toHaveBeenCalled();
      window.dispatchEvent(at(20, 3.5, {}, "pointerup"));
      const [site, from, to] = vi.mocked(plan.placeDoorAt).mock.calls[0]!;
      expect(site).toEqual({ kind: "edge", edgeKey: "20,3:W" });
      expect(new Set([from, to])).toEqual(new Set(["loc-a", "loc-b"]));
    });

    it("on a bare grid edge with no room in reach asks which rooms", () => {
      const { tools, plan } = harness();
      tools.onPointerDown(at(20, 3.5));
      window.dispatchEvent(at(20, 3.5, {}, "pointerup"));
      expect(plan.askDoorEnds).toHaveBeenCalledWith({ kind: "edge", edgeKey: "20,3:W" });
    });

    it("on a placed door cycles it for a wall key and a grid key alike, even while a listed door is armed", () => {
      const placed = way({ edge_key: "door-wall", segment: [[13, 14], [14, 14]] });
      const grid = way({ id: "way-2", edge_key: "20,3:W" });
      const { tools, plan, armed } = harness({ ways: [placed, grid] });
      armed.value = true;
      tools.onPointerDown(at(13.5, 14));
      expect(plan.cycleDoorKind).toHaveBeenLastCalledWith(placed);
      tools.onPointerDown(at(20, 3.5));
      expect(plan.cycleDoorKind).toHaveBeenLastCalledWith(grid);
      expect(plan.placeArmedDoorOn).not.toHaveBeenCalled();
      expect(plan.removeDoor).not.toHaveBeenCalled();
    });

    it("with Alt removes a placed door of either kind, and places nothing where there is none", () => {
      const placed = way({ edge_key: "door-wall", segment: [[13, 14], [14, 14]] });
      const { tools, plan } = harness({ ways: [placed] });
      tools.onPointerDown(at(13.5, 14, { altKey: true }));
      expect(plan.removeDoor).toHaveBeenCalledWith(placed);
      // Alt on a wall (no door) and on empty ground do nothing.
      tools.onPointerDown(at(11, 12, { altKey: true }));
      tools.onPointerDown(at(3.5, 3.5, { altKey: true }));
      expect(plan.placeDoorAt).not.toHaveBeenCalled();
      expect(plan.askDoorEnds).not.toHaveBeenCalled();
      expect(plan.removeDoor).toHaveBeenCalledTimes(1);
    });

    it("leaves a right-click to the pan unless Alt turns it into a delete, and swallows a press that finds nothing", () => {
      const placed = way({ edge_key: "door-wall", segment: [[13, 14], [14, 14]] });
      const { tools, plan } = harness({ ways: [placed] });
      expect(tools.onPointerDown(at(13.5, 14, { button: 2 }))).toBe(false);
      expect(plan.removeDoor).not.toHaveBeenCalled();
      expect(tools.onPointerDown(at(13.5, 14, { button: 2, altKey: true }))).toBe(true);
      expect(plan.removeDoor).toHaveBeenCalledWith(placed);
      // Mid-cell, far from any wall or edge: claimed so the click never reaches the Drawing underneath.
      expect(tools.onPointerDown(at(2.5, 2.5))).toBe(true);
      window.dispatchEvent(at(2.5, 2.5, {}, "pointerup"));
      expect(plan.placeDoorAt).not.toHaveBeenCalled();
    });
  });

  describe("a drag with no wall under the press (#1196)", () => {
    // Pressed mid-cell at (20.5, 3.5): the owner side of a rightward line is the cell below (21,4), the other above (21,3).
    const roomsAcross = [
      makeRegion({ id: "below", space_location_id: "loc-a", cells: ["21,4"] as CellKey[] }),
      makeRegion({ id: "above", space_location_id: "loc-b", cells: ["21,3"] as CellKey[] }),
    ];

    it("places a free-standing door from press to release, joining the rooms either side of that line", () => {
      const { tools, plan } = harness({ regions: roomsAcross });
      tools.onPointerDown(at(20.5, 3.5));
      window.dispatchEvent(at(21.5, 3.5, {}, "pointermove"));
      window.dispatchEvent(at(21.5, 3.5, {}, "pointerup"));
      const [site, from, to] = vi.mocked(plan.placeDoorAt).mock.calls[0]!;
      expect(site).toEqual({ kind: "free", from: [20.5, 3.5], to: [21.5, 3.5] });
      expect([from, to]).toEqual(["loc-a", "loc-b"]);
    });

    it("clamps the door to 3 cells, keeping the press point and the direction", () => {
      const { tools, plan } = harness();
      tools.onPointerDown(at(20.5, 3.5));
      window.dispatchEvent(at(28.5, 3.5, {}, "pointermove"));
      window.dispatchEvent(at(28.5, 3.5, {}, "pointerup"));
      expect(vi.mocked(plan.askDoorEnds).mock.calls[0]![0]).toEqual({ kind: "free", from: [20.5, 3.5], to: [23.5, 3.5] });
    });

    it("asks which rooms when none are beside the line, cutting nothing until the answer", () => {
      const { tools, plan } = harness();
      tools.onPointerDown(at(20.5, 3.5));
      window.dispatchEvent(at(21.5, 3.5, {}, "pointerup"));
      expect(plan.askDoorEnds).toHaveBeenCalledTimes(1);
      expect(plan.placeDoorAt).not.toHaveBeenCalled();
    });

    it("lights the line while it is being drawn, clamped to 3 cells, and nothing once released", () => {
      const { tools } = harness();
      tools.onPointerDown(at(20.5, 3.5));
      window.dispatchEvent(at(28.5, 3.5, {}, "pointermove"));
      expectSegment(tools.renderScene().hoveredDoor, [[20.5, 3.5], [23.5, 3.5]]);
      window.dispatchEvent(at(28.5, 3.5, {}, "pointerup"));
      expect(tools.renderScene().hoveredDoor).toBeNull();
    });

    it("treats a release under 0.5 cells from the press as a click on the grid edge, and 0.6 as a drag", () => {
      const click = harness();
      click.tools.onPointerDown(at(20, 3.5));
      window.dispatchEvent(at(20.3, 3.5, {}, "pointerup"));
      expect(click.plan.askDoorEnds).toHaveBeenCalledWith({ kind: "edge", edgeKey: "20,3:W" });

      const drag = harness();
      drag.tools.onPointerDown(at(20, 3.5));
      window.dispatchEvent(at(20.6, 3.5, {}, "pointerup"));
      expect(vi.mocked(drag.plan.askDoorEnds).mock.calls[0]![0].kind).toBe("free");
    });

    it("is dropped, not finished, when the gesture is abandoned", () => {
      const { tools, plan } = harness();
      tools.onPointerDown(at(20.5, 3.5));
      tools.abandonGesture();
      window.dispatchEvent(at(22.5, 3.5, {}, "pointerup"));
      expect(plan.placeDoorAt).not.toHaveBeenCalled();
      expect(plan.askDoorEnds).not.toHaveBeenCalled();
    });
  });
});
