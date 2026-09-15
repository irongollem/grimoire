// The Plan layer's own render pass, in the Cartographer's tile-pixel space
// (epic #884 S7b) — a sibling of `renderMap.ts` in this same folder, drawn
// straight onto MapWorkbench's own canvas alongside the Drawing rather than
// over a separate image.
//
// `src/lib/locations/planCanvas.ts` is the Atlas's own set of Plan render
// passes, and this module deliberately reuses everything in it that is
// genuinely geometry-agnostic: `regionFillColor` (pure palette logic over a
// region + mode, no canvas maths at all) and `drawPenOverlay` /
// `drawTemplatePreview` / `drawPersistedRingOutline` (each takes a
// `pointToCanvas` callback and never touches image fractions itself). What
// it does NOT reuse is `planCanvas.ts`'s per-cell *loop* (`drawSpacesPass` /
// `drawZonesPass` / `drawWaysPass`) — those call `cellRectInImageFractions`
// internally, which places a cell against a STATIC image filling the canvas
// edge to edge. The Cartographer's canvas is a pannable, zoomable tile grid
// with no image at all, so a cell's rect comes from `tilePx`/`viewportOffset`
// instead — the same maths `renderMap.ts`'s own tile loop already uses. The
// loop bodies here are the honest, narrow difference; the palette and the
// generic overlays are not re-derived a second time.

import {
  drawPenOverlay,
  drawPersistedRingOutline,
  drawTemplatePreview,
  regionFillColor,
  type SpacePaletteOptions,
} from "@/lib/locations/planCanvas";
import { ZONE_KIND_FILL } from "@/lib/locations/zones";
import { ZONE_KIND_LABELS, type GridPoint, type LocationMapRegion } from "@/types/locationMapRegion.types";
import type { DoorKind, SourceEdgeKey } from "@/types/locationDoor.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { TemplateDragState } from "@/lib/map/gestures/pen";

export interface TileViewport {
  tilePx: number;
  viewportOffset: { x: number; y: number };
}

export function tileCellRect(x: number, y: number, viewport: TileViewport): { x: number; y: number; w: number; h: number } {
  return {
    x: x * viewport.tilePx - viewport.viewportOffset.x,
    y: y * viewport.tilePx - viewport.viewportOffset.y,
    w: viewport.tilePx,
    h: viewport.tilePx,
  };
}

export function tileGridPointToCanvas(point: GridPoint, viewport: TileViewport): { x: number; y: number } {
  return { x: point[0] * viewport.tilePx - viewport.viewportOffset.x, y: point[1] * viewport.tilePx - viewport.viewportOffset.y };
}

function parseEdgeKey(key: SourceEdgeKey): { x: number; y: number; side: "N" | "W" } {
  const [coords, side] = key.split(":") as [string, "N" | "W"];
  const [x, y] = coords.split(",").map(Number) as [number, number];
  return { x, y, side };
}

/** The two grid-point endpoints of a plan edge, in the same cell-corner
 *  space `tileGridPointToCanvas` already draws in — the tile-space
 *  equivalent of `lib/locations/planSvg.ts`'s `edgeSegment`, which computes
 *  the same thing in image fractions. */
function edgeEndpoints(edgeKey: SourceEdgeKey): [GridPoint, GridPoint] {
  const { x, y, side } = parseEdgeKey(edgeKey);
  return side === "N" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
}

function fillCells(ctx: CanvasRenderingContext2D, cells: readonly CellKey[], viewport: TileViewport): void {
  for (const key of cells) {
    const [xs, ys] = key.split(",");
    const rect = tileCellRect(Number(xs), Number(ys), viewport);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}

function strokeCells(ctx: CanvasRenderingContext2D, cells: readonly CellKey[], viewport: TileViewport): void {
  for (const key of cells) {
    const [xs, ys] = key.split(",");
    const rect = tileCellRect(Number(xs), Number(ys), viewport);
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  }
}

/** Fills every `space` region, strokes the active one, and lays a pen-traced
 *  region's true polygon outline over its stepped cell fill — the tile-space
 *  mirror of `planCanvas.ts`'s `drawSpacesPass`. */
export function drawPlanSpaces(
  ctx: CanvasRenderingContext2D,
  viewport: TileViewport,
  regions: readonly LocationMapRegion[],
  activeRegionId: string | null,
  cellsOverride: ReadonlyMap<string, readonly CellKey[]> | undefined,
): void {
  const opts: SpacePaletteOptions = { mode: "browse", activeRegionId, partyRoomId: null, reachableRoomIds: null };
  for (const region of regions) {
    if (region.region_role !== "space") continue;
    const cells = cellsOverride?.get(region.id) ?? region.cells;
    ctx.fillStyle = regionFillColor(region, opts);
    fillCells(ctx, cells, viewport);
    if (region.id === activeRegionId) {
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2;
      strokeCells(ctx, cells, viewport);
    }
    if (region.vertices) {
      drawPersistedRingOutline(ctx, (p) => tileGridPointToCanvas(p, viewport), region.vertices);
    }
  }
}

/** Zones paint above spaces, always dashed — the tile-space mirror of
 *  `planCanvas.ts`'s `drawZonesPass`. */
export function drawPlanZones(
  ctx: CanvasRenderingContext2D,
  viewport: TileViewport,
  regions: readonly LocationMapRegion[],
  activeRegionId: string | null,
  cellsOverride: ReadonlyMap<string, readonly CellKey[]> | undefined,
): void {
  for (const region of regions) {
    if (region.region_role !== "zone" || !region.zone_kind) continue;
    const cells = cellsOverride?.get(region.id) ?? region.cells;
    const { fill, stroke } = ZONE_KIND_FILL[region.zone_kind];

    ctx.fillStyle = fill;
    fillCells(ctx, cells, viewport);

    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    for (const key of cells) {
      const [xs, ys] = key.split(",");
      const rect = tileCellRect(Number(xs), Number(ys), viewport);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.setLineDash([]);

    if (region.id === activeRegionId) {
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2;
      strokeCells(ctx, cells, viewport);
    }

    if (cells.length) {
      let sx = 0, sy = 0;
      for (const key of cells) {
        const [xs, ys] = key.split(",");
        const rect = tileCellRect(Number(xs), Number(ys), viewport);
        sx += rect.x + rect.w / 2;
        sy += rect.y + rect.h / 2;
      }
      const label = (region.label || ZONE_KIND_LABELS[region.zone_kind]).toUpperCase();
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = stroke;
      ctx.fillText(label, sx / cells.length, sy / cells.length);
    }
  }
}

export interface PlanWayLike {
  edge_key: SourceEdgeKey | null;
  door_kind: DoorKind;
  starts_locked: boolean;
  is_secret: boolean;
  to_location_id: string | null;
}

/** Doors on the plan — a bar across the door's own cell edge, colour
 *  precedence mirroring `planCanvas.ts`'s `drawWaysPass`. */
export function drawPlanWays(ctx: CanvasRenderingContext2D, viewport: TileViewport, ways: readonly PlanWayLike[]): void {
  for (const way of ways) {
    if (!way.edge_key) continue;
    const isArch = way.door_kind === "arch";
    const lineWidth = Math.max(1, (isArch ? 0.06 : 0.08) * viewport.tilePx);
    const [a, b] = edgeEndpoints(way.edge_key);
    const p1 = tileGridPointToCanvas(a, viewport);
    const p2 = tileGridPointToCanvas(b, viewport);
    const isOneSided = way.to_location_id === null;

    ctx.strokeStyle = way.is_secret ? "#a78bfa" : way.starts_locked ? "#fbbf24" : isArch ? "#6b5c47" : "#e7d9bd";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "butt";
    if (way.is_secret) ctx.setLineDash([lineWidth * 0.75, lineWidth * 0.5]);
    else if (isOneSided) ctx.setLineDash([lineWidth * 1.4, lineWidth]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    if (way.is_secret || isOneSided) ctx.setLineDash([]);
  }
}

/** The door tool's own hover highlight — the edge a click would place or
 *  cycle a door on. */
export function drawPlanDoorHover(ctx: CanvasRenderingContext2D, viewport: TileViewport, edgeKey: SourceEdgeKey): void {
  const lineWidth = Math.max(2, 0.12 * viewport.tilePx);
  const [a, b] = edgeEndpoints(edgeKey);
  const p1 = tileGridPointToCanvas(a, viewport);
  const p2 = tileGridPointToCanvas(b, viewport);
  ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

const NODE_SIZE_PX = 9;
const SNAP_HIT_RADIUS_CELLS = 0.4;

/** The pen tool's live ring (draft or persisted-being-dragged) and the
 *  template drag preview — both pass straight through to `planCanvas.ts`'s
 *  fully generic overlays, since neither touches image fractions. */
export function drawPlanTracingOverlay(
  ctx: CanvasRenderingContext2D,
  viewport: TileViewport,
  ring: readonly GridPoint[] | null,
  closed: boolean,
  hoverPoint: GridPoint | null,
  templateDraft: TemplateDragState | null,
  templateRing: readonly GridPoint[],
): void {
  const pointToCanvas = (p: GridPoint) => tileGridPointToCanvas(p, viewport);
  if (ring && ring.length > 0) {
    drawPenOverlay(ctx, pointToCanvas, ring, closed, hoverPoint, NODE_SIZE_PX, SNAP_HIT_RADIUS_CELLS);
  }
  if (templateDraft && templateDraft.radius > 0) {
    drawTemplatePreview(ctx, pointToCanvas, templateRing);
  }
}
