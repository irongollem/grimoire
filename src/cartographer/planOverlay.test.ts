import { describe, expect, it } from "vitest";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import { drawPlanSpaces, drawPlanZones, type TileViewport } from "./planOverlay";

const VIEWPORT: TileViewport = { tilePx: 10, viewportOffset: { x: 0, y: 0 } };

function recorder(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const ctx = {} as CanvasRenderingContext2D;
  for (const prop of ["fillStyle", "strokeStyle", "lineWidth", "font", "textAlign", "textBaseline"]) {
    Object.defineProperty(ctx, prop, { set: () => undefined, get: () => undefined });
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
