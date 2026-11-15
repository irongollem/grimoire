// Fake-event tests for the gesture state machine. `useRegionPointer` is
// built to be called from a component's `<script setup>` — it registers a
// `keydown` listener via `onMounted` — but every test here drives the
// returned handlers directly, the same way `MapRegionsLayer.vue` binds them
// to the canvas, so the missing component instance (and the dev warning
// Vue prints for the no-op `onMounted` outside one) is irrelevant: nothing
// here depends on that listener ever attaching.
//
// This module now covers tracing (paint/pen/template) plus the composed
// click routing's own guard against a click resolving as a fresh selection
// mid-trace. Plain hover/click-routing coverage — the read/navigate
// contract this composes — moved to `useRegionNavPointer.test.ts` when
// that half split out (#884 loose-end cleanup); the tap threshold case in
// "what a tap does" below is the check that the composition itself is wired up.
import { afterEach, describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { useRegionPointer, type UseRegionPointerOptions } from "./useRegionPointer";
import { cellsInsideRing, type TraceTool } from "@/lib/locations/polygon";
import type { CellKey } from "@/types/dungeonMap.types";
import type { GridPoint, LocationMapRegion } from "@/types/locationMapRegion.types";

function makeRegion(overrides: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "region-1",
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

/** A fake cell/grid space: `cellAt`/`gridPointAt` map client coordinates
 *  straight through (identity), so a test can reason about plain numbers
 *  instead of a calibration. */
function makeHarness(overrides: Partial<UseRegionPointerOptions> = {}) {
  const region: { current: LocationMapRegion | null } = { current: makeRegion() };
  const mode: { current: "browse" | "run" } = { current: "browse" };
  const tool: { current: TraceTool } = { current: "paint" };
  const radius = { current: 0.75 };

  const options: UseRegionPointerOptions = {
    cellAt: vi.fn((x: number, y: number) => `${x},${y}` as CellKey),
    isPaintable: vi.fn(() => true),
    gridPointAt: vi.fn((x: number, y: number) => [x, y] as GridPoint),
    activeRegion: vi.fn(() => region.current),
    hasActiveRegionId: vi.fn(() => region.current !== null),
    tool: vi.fn(() => tool.current),
    brushRadius: vi.fn(() => radius.current),
    mode: vi.fn(() => mode.current),
    regionAt: vi.fn(() => null),
    hoverRegionAt: vi.fn(() => null),
    commitCells: vi.fn(),
    commitRing: vi.fn().mockResolvedValue(undefined),
    commitTemplate: vi.fn(),
    onSelect: vi.fn(),
    onNavigate: vi.fn(),
    onDescend: vi.fn(),
    onMoveParty: vi.fn(),
    isNestedSite: vi.fn(() => false),
    onHover: vi.fn(),
    ...overrides,
  };

  const pointer = useRegionPointer(options);
  return { options, pointer, region, mode, tool, radius };
}

function down(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointerdown", { clientX: x, clientY: y, ...init });
}
function move(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointermove", { clientX: x, clientY: y, ...init });
}
function up(x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent("pointerup", { clientX: x, clientY: y, ...init });
}


/** Even-odd point-in-ring, written out here so a test never leans on the code it checks. */
function inside(ring: readonly GridPoint[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function lastRing(options: UseRegionPointerOptions): GridPoint[] {
  const calls = vi.mocked(options.commitRing).mock.calls;
  return calls[calls.length - 1][1];
}

/** `n` points round a circle, the way a hand's drag samples it. */
function circle(cx: number, cy: number, r: number, n: number): GridPoint[] {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as GridPoint);
}

function drag(pointer: ReturnType<typeof useRegionPointer>, points: readonly GridPoint[], init: PointerEventInit = {}): void {
  pointer.onPointerDown(down(points[0][0], points[0][1], init));
  for (const [x, y] of points.slice(1)) window.dispatchEvent(move(x, y, init));
  const last = points[points.length - 1];
  window.dispatchEvent(up(last[0], last[1], init));
}

const SQUARE_5_9: GridPoint[] = [[5, 5], [9, 5], [9, 9], [5, 9]];

afterEach(() => vi.useRealTimers());

describe("round brush (#1197, frame 05)", () => {
  it.each([2, 3])("a single disc of radius %s on an empty region commits a ring hugging the disc, not a run of squares", (r) => {
    const { pointer, options, region, radius } = makeHarness();
    radius.current = r;
    region.current = makeRegion({ cells: [] });

    drag(pointer, [[10, 10]]);

    // Reasoned: one disc centred (10,10) of radius r; the raster is 1/8 square fine and the fit tolerance 0.08.
    const ring = lastRing(options);
    expect(ring.length).toBeGreaterThanOrEqual(8);
    for (const [x, y] of ring) expect(Math.abs(Math.hypot(x - 10, y - 10) - r)).toBeLessThan(0.25);
    expect(options.commitCells).not.toHaveBeenCalled();
  });

  it("extends an existing ring: the result holds the old shape and the new stroke", () => {
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ vertices: SQUARE_5_9, cells: ["5,5"] });

    // A stroke of radius 0.75 from the square's right edge out to x = 12.
    drag(pointer, [[9, 7], [12, 7]]);

    const ring = lastRing(options);
    expect(inside(ring, 7, 7)).toBe(true); // the old square's middle
    expect(inside(ring, 11, 7)).toBe(true); // well past its right edge, on the stroke
    expect(inside(ring, 11, 9)).toBe(false); // a stroke is not a bounding box
  });

  it("grows a zone that was painted as squares, from its squares", () => {
    const { pointer, options, region } = makeHarness();
    const cells = ["5,5", "6,5", "7,5", "5,6", "6,6", "7,6", "5,7", "6,7", "7,7"] as CellKey[]; // 5..8 square
    region.current = makeRegion({ vertices: null, cells });

    drag(pointer, [[8.5, 6.5], [10, 6.5]]);

    const ring = lastRing(options);
    expect(inside(ring, 6.5, 6.5)).toBe(true); // an old square survives
    expect(inside(ring, 9.5, 6.5)).toBe(true); // the stroke
    expect(inside(ring, 6.5, 8.6)).toBe(false); // outside both
    expect(options.commitCells).not.toHaveBeenCalled();
  });

  it("Alt carves the shape away instead of adding to it", () => {
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ vertices: [[0, 0], [6, 0], [6, 6], [0, 6]], cells: ["0,0"] });

    drag(pointer, [[6, 3]], { altKey: true });

    const ring = lastRing(options);
    expect(inside(ring, 1, 3)).toBe(true); // the far side stays
    expect(inside(ring, 5.7, 3)).toBe(false); // 0.3 from the disc's centre: carved
  });

  it("a carve that splits the zone keeps the larger part", () => {
    const { pointer, options, region, radius } = makeHarness();
    radius.current = 1.2;
    region.current = makeRegion({ vertices: [[0, 0], [10, 0], [10, 2], [0, 2]], cells: ["0,0"] });

    // A disc of radius 1.2 at (8,1) spans the whole height (0..2): the long left part (about 7 by 2) and a short
    // right part (about 1 by 2) are left.
    drag(pointer, [[8, 1]], { altKey: true });

    const ring = lastRing(options);
    expect(inside(ring, 3, 1)).toBe(true);
    expect(Math.max(...ring.map((p) => p[0]))).toBeLessThan(7.6);
  });

  it("carving everything away leaves an empty region, with no ring committed", () => {
    const { pointer, options, region, radius } = makeHarness();
    radius.current = 3;
    region.current = makeRegion({ vertices: [[0, 0], [2, 0], [2, 2], [0, 2]], cells: ["0,0"] });
    drag(pointer, [[1, 1]], { altKey: true });

    expect(options.commitCells).toHaveBeenCalledWith("region-1", []);
    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("a carve that leaves less than one square empties the region", () => {
    const { pointer, options, region, radius } = makeHarness();
    radius.current = 2.7;
    region.current = makeRegion({ vertices: [[0, 0], [2, 0], [2, 2], [0, 2]], cells: ["0,0"] });

    // Reasoned: the disc at (3,1) of radius 2.7 reaches x = 0.3 at y = 1 and x = 0.49 at the edges, leaving a
    // sliver about 0.8 square in area.
    drag(pointer, [[3, 1]], { altKey: true });

    expect(options.commitCells).toHaveBeenCalledWith("region-1", []);
    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("a stroke that changes nothing commits nothing", () => {
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ vertices: SQUARE_5_9, cells: ["5,5"] });

    drag(pointer, [[30, 30]], { altKey: true }); // carving far away

    expect(options.commitRing).not.toHaveBeenCalled();
    expect(options.commitCells).not.toHaveBeenCalled();
  });

  it("shows the shape so far on a throttle and commits only on release", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ cells: [] });

    pointer.onPointerDown(down(10, 10));
    expect(pointer.strokePreview.value?.closed).toBe(true);
    const widest = () => Math.max(...pointer.strokePreview.value!.ring.map((p) => p[0]));
    expect(widest()).toBeLessThan(11); // one disc round (10,10)

    vi.advanceTimersByTime(10);
    window.dispatchEvent(move(14, 10));
    expect(widest()).toBeLessThan(11); // inside the throttle window: the last ring stays
    vi.advanceTimersByTime(60);
    expect(widest()).toBeGreaterThan(14); // the trailing recompute shows the drag
    expect(options.commitRing).not.toHaveBeenCalled(); // a preview is never stored

    window.dispatchEvent(up(14, 10));
    expect(options.commitRing).toHaveBeenCalledTimes(1);
    expect(pointer.strokePreview.value).toBeNull();
  });

  it("only starts on a cell the grid actually lays across the image", () => {
    const { pointer } = makeHarness({ isPaintable: vi.fn(() => false) });
    pointer.onPointerDown(down(2, 2));
    expect(pointer.strokePreview.value).toBeNull();
  });

  it("ignores cells outside the grid while a stroke is dragged across them", () => {
    const paintable = new Set(["2,2", "3,3"]);
    const { pointer, options } = makeHarness({ isPaintable: vi.fn((cell: CellKey) => paintable.has(cell)) });
    pointer.onPointerDown(down(2, 2));
    window.dispatchEvent(move(9, 9)); // outside the grid
    window.dispatchEvent(up(9, 9));
    // Reasoned: only the disc at (2,2) was stamped, so the ring stays near x 2.
    expect(Math.max(...lastRing(options).map((p) => p[0]))).toBeLessThan(3.2);
  });
});

describe("lasso (#1197, frame 05)", () => {
  it("one drag round a circle of radius 3 commits a smooth ring on the circle, with the squares whose middle it holds", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "lasso";
    region.current = makeRegion({ cells: [] });

    drag(pointer, circle(10, 10, 3, 48));

    expect(options.commitRing).toHaveBeenCalledTimes(1);
    const ring = lastRing(options);
    // Reasoned: the dragged points are exact on the circle and the fit only drops points, so each kept point is on it.
    for (const [x, y] of ring) expect(Math.abs(Math.hypot(x - 10, y - 10) - 3)).toBeLessThan(0.01);
    // The squares: a square whose middle is 2.8 or less from the centre is inside the (slightly inscribed) ring, and one
    // whose middle is 3.2 or more away is out.
    const cells = new Set(cellsInsideRing(ring));
    for (let x = 4; x <= 16; x++) {
      for (let y = 4; y <= 16; y++) {
        const d = Math.hypot(x + 0.5 - 10, y + 0.5 - 10);
        if (d <= 2.8) expect(cells.has(`${x},${y}`)).toBe(true);
        if (d >= 3.2) expect(cells.has(`${x},${y}`)).toBe(false);
      }
    }
  });

  it("a click or a scribble smaller than one square commits nothing", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "lasso";
    region.current = makeRegion();

    drag(pointer, [[0, 0], [0.3, 0], [0.3, 0.3], [0, 0.3]]); // 0.09 square
    drag(pointer, [[0, 0], [5, 5]]); // two points make no area

    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("replaces the shape the region already has, even when the drag starts on one of its nodes", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "lasso";
    region.current = makeRegion({ vertices: TRIANGLE, cells: ["9,9"] });

    // Starts exactly on the triangle's node at (0,0), where the pen would start dragging that node.
    drag(pointer, [[0, 0], [6, 0], [6, 6], [0, 6]]);

    expect(pointer.liveDrag.value).toBeNull();
    expect(options.commitRing).toHaveBeenCalledTimes(1);
    const ring = lastRing(options);
    expect(vi.mocked(options.commitRing).mock.calls[0][0]).toBe("region-1");
    expect(inside(ring, 5, 5)).toBe(true); // the new square, where the triangle never reached
  });

  it("shows the drag as an open, unsnapped ring and skips a point under 0.05 from the last", () => {
    const { pointer, region, tool } = makeHarness();
    tool.current = "lasso";
    region.current = makeRegion();

    pointer.onPointerDown(down(0.37, 0.61));
    expect(pointer.strokePreview.value).toEqual({ regionId: "region-1", ring: [[0.37, 0.61]], closed: false });
    window.dispatchEvent(move(0.4, 0.61)); // 0.03 away
    expect(pointer.strokePreview.value?.ring).toHaveLength(1);
    window.dispatchEvent(move(1.2, 0.9));
    expect(pointer.strokePreview.value?.ring).toEqual([[0.37, 0.61], [1.2, 0.9]]);
  });

  it("abandoning mid-drag commits nothing, even when the release still comes", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "lasso";
    region.current = makeRegion();

    pointer.onPointerDown(down(0, 0));
    window.dispatchEvent(move(6, 0));
    window.dispatchEvent(move(6, 6));
    pointer.abandonGesture();
    window.dispatchEvent(up(0, 6));

    expect(pointer.strokePreview.value).toBeNull();
    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("Escape drops a lasso in flight", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "lasso";
    region.current = makeRegion();

    pointer.onPointerDown(down(0, 0));
    window.dispatchEvent(move(6, 0));
    pointer.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    window.dispatchEvent(move(6, 6));
    window.dispatchEvent(up(0, 6));

    expect(pointer.strokePreview.value).toBeNull();
    expect(options.commitRing).not.toHaveBeenCalled();
  });
});

describe("abandonGesture (#884 review finding 2)", () => {
  it("an abandoned brush stroke's stray pointerup does not commit it", () => {
    // The bug this reproduces: a DM starts a Zone brush stroke, then switches the active layer away from Plan with
    // the pointer still down. The window pointermove/pointerup listeners `onPointerDown` attached outlive that
    // switch, so the eventual pointerup would otherwise still commit the abandoned stroke.
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ cells: [] });

    pointer.onPointerDown(down(2, 2));
    window.dispatchEvent(move(3, 3));
    expect(pointer.strokePreview.value).not.toBeNull();

    pointer.abandonGesture();
    expect(pointer.strokePreview.value).toBeNull();

    window.dispatchEvent(up(3, 3));
    expect(options.commitRing).not.toHaveBeenCalled();
    expect(options.commitCells).not.toHaveBeenCalled();
  });

  it("abandons a live drag on a persisted pen ring without committing it", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: [[0, 0], [4, 0], [4, 4], [0, 4]] });

    pointer.onPointerDown(down(0, 0)); // grabs the first vertex
    expect(pointer.liveDrag.value).not.toBeNull();

    pointer.abandonGesture();
    expect(pointer.liveDrag.value).toBeNull();

    window.dispatchEvent(up(1, 1));
    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("abandons a template drag without committing it", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "template";
    region.current = makeRegion();

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(move(8, 9));
    expect(pointer.templateDraft.value?.radius).toBe(5);

    pointer.abandonGesture();
    expect(pointer.templateDraft.value).toBeNull();

    window.dispatchEvent(up(8, 9));
    expect(options.commitTemplate).not.toHaveBeenCalled();
  });

  it("abandons an unsaved pen draft, same as Escape", () => {
    const { pointer, tool, region } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });

    pointer.onPointerDown(down(0, 0));
    pointer.onPointerDown(down(4, 0));
    expect(pointer.draftRing.value).toHaveLength(2);

    pointer.abandonGesture();
    expect(pointer.draftRing.value).toEqual([]);
  });

  it("is a harmless no-op when nothing is in flight", () => {
    const { pointer } = makeHarness();
    expect(() => pointer.abandonGesture()).not.toThrow();
  });
});

describe("pen tool", () => {
  it("closes a draft once the first node is clicked again", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });

    pointer.onPointerDown(down(0, 0));
    pointer.onPointerDown(down(4, 0));
    pointer.onPointerDown(down(2, 4));
    expect(pointer.draftRing.value).toEqual([
      [0, 0],
      [4, 0],
      [2, 4],
    ]);

    pointer.onPointerDown(down(0.1, 0.1)); // within snap range of the first node
    expect(options.commitRing).toHaveBeenCalledWith("region-1", [
      [0, 0],
      [4, 0],
      [2, 4],
    ]);
    expect(pointer.draftRing.value).toEqual([]); // handed off, not left behind
  });

  it("alt-click refuses to delete a persisted ring below 3 points", () => {
    const triangle: GridPoint[] = [
      [0, 0],
      [4, 0],
      [2, 4],
    ];
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    // A persisted 3-point ring — alt-delete on it should refuse below 3.
    region.current = makeRegion({ vertices: triangle });

    pointer.onPointerDown(down(0.1, 0.1, { altKey: true }));

    expect(options.commitRing).toHaveBeenCalledWith("region-1", triangle);
  });

  it("double-click inserts a node into a persisted ring", () => {
    const triangle: GridPoint[] = [
      [0, 0],
      [4, 0],
      [2, 4],
    ];
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: triangle });

    pointer.onDoubleClick(new MouseEvent("dblclick", { clientX: 2, clientY: 0 }));

    expect(options.commitRing).toHaveBeenCalled();
    const [, ring] = vi.mocked(options.commitRing).mock.calls[0]!;
    expect(ring).toHaveLength(4);
  });

  it("Escape abandons an unsaved draft only", () => {
    const { pointer, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });

    pointer.onPointerDown(down(0, 0));
    pointer.onPointerDown(down(4, 0));
    expect(pointer.draftRing.value).toHaveLength(2);

    pointer.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(pointer.draftRing.value).toEqual([]);
  });
});

describe("composition — click while tracing", () => {
  it("adding a draft node never also resolves as a fresh selection", () => {
    // A pen click that misses every existing node just calls `pen.addPoint`
    // locally — none of strokePreview/penDrag/templateDrag get set, so the
    // pointerup would otherwise fall through to a plain click. The
    // `hasActiveRegionId` guard in `handleClick` is what stops that from
    // also routing through `useRegionNavPointer`'s click logic.
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });

    pointer.onPointerDown(down(0, 0));
    window.dispatchEvent(up(0, 0));

    expect(pointer.draftRing.value).toEqual([[0, 0]]);
    expect(options.regionAt).not.toHaveBeenCalled();
    expect(options.onSelect).not.toHaveBeenCalled();
    expect(options.onNavigate).not.toHaveBeenCalled();
  });
});

describe("template drag", () => {
  it("tracks radius while dragging and commits on release", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "template";
    region.current = makeRegion();

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(move(8, 9)); // 3-4-5 triangle from the centre
    expect(pointer.templateDraft.value?.radius).toBe(5);

    window.dispatchEvent(up(8, 9));
    expect(options.commitTemplate).toHaveBeenCalledTimes(1);
    const [regionId] = vi.mocked(options.commitTemplate).mock.calls[0]!;
    expect(regionId).toBe("region-1");
  });

  it("drops a zero-radius drag without committing anything", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "template";
    region.current = makeRegion();

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(up(5, 5)); // released without ever dragging

    expect(options.commitTemplate).not.toHaveBeenCalled();
  });
});

describe("hover", () => {
  it("emits on change and suppresses while a stroke is in flight", () => {
    const { pointer, options, region } = makeHarness();
    region.current = makeRegion({ cells: [] });
    vi.mocked(options.hoverRegionAt).mockReturnValue(makeRegion({ id: "hovered" }));

    pointer.onPointerMove(move(0, 0));
    expect(options.onHover).toHaveBeenCalledWith("hovered");

    pointer.onPointerMove(move(0, 0)); // unchanged — no repeat emit
    expect(options.onHover).toHaveBeenCalledTimes(1);

    pointer.onPointerDown(down(1, 1)); // starts a brush stroke
    vi.mocked(options.hoverRegionAt).mockReturnValue(null);
    pointer.onPointerMove(move(2, 2));
    expect(options.onHover).toHaveBeenCalledTimes(1); // suppressed mid-stroke

    pointer.onPointerLeave();
    expect(options.onHover).toHaveBeenLastCalledWith(null);
  });
});

const TRIANGLE: GridPoint[] = [[0, 0], [4, 0], [2, 4]];

// Every pointerdown leaves a window listener until its pointerup; end whatever a test left open.
afterEach(() => {
  window.dispatchEvent(up(0, 0));
});

describe("what a tap does in run mode and in browse mode", () => {
  it("a tap on a bound room moves the party in run mode even while a shape is selected for tracing", () => {
    const { pointer, options, mode } = makeHarness();
    mode.current = "run";
    vi.mocked(options.regionAt).mockReturnValue(makeRegion({ space_location_id: "room-1" }));

    pointer.onPointerDown(down(5, 5));
    window.dispatchEvent(up(5, 5));

    expect(options.onMoveParty).toHaveBeenCalledWith("room-1");
  });

  it.each([
    [6, true],
    [7, false],
  ])("a pointer that wandered %i px is a tap: %s", (distance, isTap) => {
    const { pointer, options, region } = makeHarness();
    region.current = null;
    vi.mocked(options.regionAt).mockReturnValue(makeRegion({ id: "target" }));

    pointer.onPointerDown(down(0, 0));
    window.dispatchEvent(move(distance, 0));
    window.dispatchEvent(up(distance, 0));

    expect(options.onSelect).toHaveBeenCalledTimes(isTap ? 1 : 0);
  });

  it("run mode never starts a stroke, whatever tool and shape are selected", () => {
    const { pointer, mode, region } = makeHarness();
    mode.current = "run";
    region.current = makeRegion();

    pointer.onPointerDown(down(2, 2));

    expect(pointer.strokePreview.value).toBeNull();
  });
});

describe("pen tool details", () => {
  it("puts the ring back as a draft when closing it fails to save, so nothing is lost", async () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });
    vi.mocked(options.commitRing).mockRejectedValueOnce(new Error("offline"));

    pointer.onPointerDown(down(0, 0));
    pointer.onPointerDown(down(4, 0));
    pointer.onPointerDown(down(2, 4));
    pointer.onPointerDown(down(0.1, 0.1));
    await vi.waitFor(() => expect(pointer.draftRing.value).toEqual(TRIANGLE));
  });

  it("a click away from every node of a saved ring adds nothing: a node mid-ring is only ever a double-click", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: TRIANGLE });

    pointer.onPointerDown(down(10, 10));

    expect(pointer.draftRing.value).toEqual([]);
    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("snaps a new node to whole cells, and to half cells with alt held", () => {
    const { pointer, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });

    pointer.onPointerDown(down(0.6, 1.4));
    pointer.onPointerDown(down(6.6, 1.4, { altKey: true }));

    expect(pointer.draftRing.value).toEqual([[1, 1], [6.5, 1.5]]);
  });

  it("dragging a node of an unsaved draft moves it in the draft, and writes nothing", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });
    pointer.onPointerDown(down(0, 0));
    pointer.onPointerDown(down(4, 0));

    pointer.onPointerDown(down(4, 0)); // grab the second node
    window.dispatchEvent(move(6, 0));
    window.dispatchEvent(up(6, 0));

    expect(pointer.draftRing.value).toEqual([[0, 0], [6, 0]]);
    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("dragging a node of a saved ring writes the moved ring on release", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: TRIANGLE });

    pointer.onPointerDown(down(4, 0));
    window.dispatchEvent(move(6, 0));
    window.dispatchEvent(up(6, 0));

    expect(options.commitRing).toHaveBeenCalledWith("region-1", [[0, 0], [6, 0], [2, 4]]);
  });

  it("a double-click on an edge of an unsaved draft inserts a node into the draft", () => {
    const { pointer, options, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });
    for (const [x, y] of TRIANGLE) pointer.onPointerDown(down(x, y));

    pointer.onDoubleClick(new MouseEvent("dblclick", { clientX: 2, clientY: 0 }));

    expect(pointer.draftRing.value).toHaveLength(4);
    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("a double-click does nothing on any other tool", () => {
    const { pointer, options, region } = makeHarness(); // paint tool
    region.current = makeRegion({ vertices: TRIANGLE });

    pointer.onDoubleClick(new MouseEvent("dblclick", { clientX: 2, clientY: 0 }));

    expect(options.commitRing).not.toHaveBeenCalled();
  });

  it("Escape leaves a saved ring alone and ignores every other key", () => {
    const { pointer, region, tool } = makeHarness();
    tool.current = "pen";
    region.current = makeRegion({ vertices: null });
    pointer.onPointerDown(down(0, 0));
    pointer.onPointerDown(down(4, 0));

    pointer.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(pointer.draftRing.value).toHaveLength(2);

    region.current = makeRegion({ vertices: TRIANGLE });
    pointer.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(pointer.draftRing.value).toHaveLength(2);
  });

  it("follows the cursor with the point the next click would snap to, on the pen tool only", () => {
    const { pointer, region, tool, mode } = makeHarness();
    region.current = makeRegion({ vertices: null });

    tool.current = "pen";
    pointer.onPointerMove(move(0.6, 1.4));
    expect(pointer.penHoverPoint.value).toEqual([1, 1]);

    tool.current = "paint";
    pointer.onPointerMove(move(0.6, 1.4));
    expect(pointer.penHoverPoint.value).toBeNull();

    tool.current = "pen";
    pointer.onPointerMove(move(0.6, 1.4));
    mode.current = "run";
    pointer.onPointerMove(move(0.6, 1.4));
    expect(pointer.penHoverPoint.value).toBeNull();
  });
});

describe("template details", () => {
  it("puts the centre on a whole cell, however the pointer landed", () => {
    const { pointer, region, tool } = makeHarness();
    tool.current = "template";
    region.current = makeRegion();

    pointer.onPointerDown(down(5.4, 5.6));

    expect(pointer.templateDraft.value?.center).toEqual([5, 6]);
  });
});

describe("Escape through the mounted keydown listener", () => {
  it("abandons an unsaved draft while mounted and stops listening once disposed", () => {
    let pointer!: ReturnType<typeof useRegionPointer>;
    const region = makeRegion({ vertices: null });
    const wrapper = mount(
      defineComponent({
        setup() {
          pointer = useRegionPointer({
            ...makeHarness().options,
            tool: () => "pen",
            activeRegion: () => region,
          });
          return () => h("div");
        },
      }),
    );
    const escape = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    pointer.onPointerDown(down(0, 0));
    expect(pointer.draftRing.value).toHaveLength(1);
    escape();
    expect(pointer.draftRing.value).toEqual([]);

    pointer.onPointerDown(down(0, 0));
    pointer.dispose();
    escape();
    expect(pointer.draftRing.value).toHaveLength(1);
    wrapper.unmount();
  });
});
