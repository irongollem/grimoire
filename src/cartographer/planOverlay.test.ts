import { describe, expect, it } from "vitest";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import { drawPlanAssignHover, drawPlanSpaces, drawPlanWays, drawPlanZones, type PlanWayLike, type TileViewport } from "./planOverlay";

const VIEWPORT: TileViewport = { tilePx: 10, viewportOffset: { x: 0, y: 0 } };

function recorder(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const ctx = {} as CanvasRenderingContext2D;
  for (const prop of ["fillStyle", "strokeStyle", "lineWidth", "font", "textAlign", "textBaseline"]) {
    Object.defineProperty(ctx, prop, { set: () => {}, get: () => undefined });
  }
  for (const m of ["fillRect", "strokeRect", "beginPath", "moveTo", "lineTo", "closePath", "stroke", "fill", "setLineDash", "fillText", "save", "restore", "clip"]) {
    (ctx as unknown as Record<string, (...a: unknown[]) => void>)[m] = (...a) => calls.push(`${m}(${a.join(",")})`);
  }
  return { ctx, calls };
}

const region = (over: Partial<LocationMapRegion>): LocationMapRegion =>
  ({ id: "r", region_role: "space", space_location_id: null, cells: ["0,0"], vertices: null, zone_kind: null, label: null, ...over }) as LocationMapRegion;

describe("the Zoning overlay", () => {
  it("fills a found room along its outline, so the round chapel is not a staircase", () => {
    const { ctx, calls } = recorder();
    drawPlanSpaces(ctx, VIEWPORT, [region({ vertices: [[0, 0], [4, 0], [2, 5]] })], null, undefined);
    expect(calls.filter((c) => c.startsWith("fillRect"))).toEqual([]);
    expect(calls).toContain("lineTo(40,0)");
    expect(calls).toContain("lineTo(20,50)");
  });

  it("fills by squares a room that has no outline", () => {
    const { ctx, calls } = recorder();
    drawPlanSpaces(ctx, VIEWPORT, [region({})], null, undefined);
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(1);
  });

  it("cuts a brushed zone to the room it lies in", () => {
    const { ctx, calls } = recorder();
    const room = region({ id: "room", vertices: [[0, 0], [6, 0], [6, 6], [0, 6]] });
    const zone = region({ id: "z", region_role: "zone", zone_kind: "hazard", cells: ["1,1"] });
    drawPlanZones(ctx, VIEWPORT, [room, zone], null, undefined);
    expect(calls.indexOf("clip()")).toBeGreaterThan(-1);
    expect(calls.indexOf("clip()")).toBeLessThan(calls.findIndex((c) => c.startsWith("fillRect")));
  });
});

describe("the Zoning overlay's ways", () => {
  const way = (over: Partial<PlanWayLike>): PlanWayLike => ({
    edge_key: null,
    segment: null,
    door_kind: "door",
    starts_locked: false,
    is_secret: false,
    to_location_id: "room-b",
    ...over,
  });

  // Tile size 10, no offset: line (1,2)-(4,6) lands on (10,20)-(40,60).
  it("draws an angled way at its real end points, not on a grid edge", () => {
    const { ctx, calls } = recorder();
    drawPlanWays(ctx, VIEWPORT, [
      way({ edge_key: "6f1c2d3e-0000-4000-8000-000000000001", segment: [[1, 2], [4, 6]] }),
    ]);
    expect(calls).toContain("moveTo(10,20)");
    expect(calls).toContain("lineTo(40,60)");
  });

  it("draws a grid-edge way on its edge: the W edge of cell 2,3 is x = 20 from y = 40 to 30", () => {
    const { ctx, calls } = recorder();
    drawPlanWays(ctx, VIEWPORT, [way({ edge_key: "2,3:W" })]);
    // gridEdgeSegment stores a W edge bottom to top: (2,4) then (2,3).
    expect(calls).toContain("moveTo(20,40)");
    expect(calls).toContain("lineTo(20,30)");
  });

  it("skips a way with no line, whether unplaced or a wall uuid that lost its segment", () => {
    const { ctx, calls } = recorder();
    drawPlanWays(ctx, VIEWPORT, [way({}), way({ edge_key: "6f1c2d3e-0000-4000-8000-000000000001" })]);
    expect(calls).toEqual([]);
  });
});

describe("the Assign hover", () => {
  // Tile size 10: the ring's corner (2,3) lands on (20,30).
  it("fills a ring of walls along its outline, not by squares, and edges it", () => {
    const { ctx, calls } = recorder();
    drawPlanAssignHover(ctx, VIEWPORT, { cells: ["2,3"], outline: [[2, 3], [5, 3], [5, 7]] });
    expect(calls.filter((c) => c.startsWith("fillRect"))).toEqual([]);
    expect(calls).toContain("lineTo(50,30)");
    expect(calls).toContain("lineTo(50,70)");
    expect(calls.filter((c) => c === "fill()")).toHaveLength(1);
    expect(calls.filter((c) => c === "stroke()")).toHaveLength(1);
  });

  it("fills painted floor by its squares, with no outline stroked", () => {
    const { ctx, calls } = recorder();
    drawPlanAssignHover(ctx, VIEWPORT, { cells: ["0,0", "1,0"], outline: null });
    expect(calls.filter((c) => c.startsWith("fillRect"))).toHaveLength(2);
    expect(calls.filter((c) => c === "stroke()")).toEqual([]);
  });
});
