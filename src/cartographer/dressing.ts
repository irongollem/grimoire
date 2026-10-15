// Dressing geometry and drawing (epic #1062): pure helpers for the props a DM
// places on a map. A prop covers a footprint of w x h cells, turns to any
// angle about the footprint's centre, and overlaps others by stacking order.
//
// No vue and no DOM globals at module scope: the editor renderer, the bake
// (OffscreenCanvas) and the tests all import this.

import type { DressingPlacement } from "@/types/dungeonMap.types";

export interface DressingProp {
  id: string;
  name: string;
  footprint_w: number;
  footprint_h: number;
  /** Null until the art is loaded (or painted): drawn as a placeholder. */
  image: CanvasImageSource | null;
  /** Lies on the floor: casts no shadow of its own, only an occlusion rim (#1065). */
  flat: boolean;
}

export type DressingCatalog = ReadonlyMap<string, DressingProp>;

export type DressingLayer = Readonly<Record<string, DressingPlacement>>;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CellPoint {
  x: number;
  y: number;
}

export interface CellBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Float noise from sin/cos of a right angle must not spill into an extra cell. */
const EPSILON = 1e-6;

/**
 * Footprint of a placement in cells, before rotation. A prop missing from the
 * catalog (its book was removed, or the library has not loaded yet) counts as
 * 1x1, so the placement still has a cell to be found, selected and deleted at.
 */
export function dressingFootprint(placement: DressingPlacement, catalog: DressingCatalog): { w: number; h: number } {
  const prop = catalog.get(placement.prop_id);
  return prop ? { w: prop.footprint_w, h: prop.footprint_h } : { w: 1, h: 1 };
}

/**
 * The point a placement turns about, in cell units: the centre of its
 * footprint as turned to the nearest quarter, with the anchor at that
 * footprint's top-left. Turning about the UNROTATED footprint's centre would
 * leave a 2x1 table half a cell off the grid after a quarter turn (its centre
 * sits on a cell edge one way and mid-cell the other); this way every quarter
 * turn lands on whole cells. No single centre can do that for both quarters of
 * a non-square prop, so a free angle turns about its NEAREST quarter's centre:
 * a 2x1 turned past 45 degrees steps half a cell, to the centre it will have at
 * 90. A square prop's centre never moves.
 */
export function dressingCentre(placement: DressingPlacement, w: number, h: number): CellPoint {
  const quarter = (((Math.round(placement.rotation / 90) % 4) + 4) % 4);
  const [qw, qh] = quarter % 2 === 1 ? [h, w] : [w, h];
  return { x: placement.x + qw / 2, y: placement.y + qh / 2 };
}

/** The four corners in cell units, rotated about the placement's centre. */
export function dressingCorners(placement: DressingPlacement, w: number, h: number): CellPoint[] {
  const { x: cx, y: cy } = dressingCentre(placement, w, h);
  const rad = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = w / 2;
  const hh = h / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([dx, dy]) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }));
}

/** Every cell the rotated footprint's bounding box touches, inclusive. */
export function dressingCellBounds(placement: DressingPlacement, catalog: DressingCatalog): CellBounds {
  const { w, h } = dressingFootprint(placement, catalog);
  const corners = dressingCorners(placement, w, h);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    minX: Math.floor(Math.min(...xs) + EPSILON),
    minY: Math.floor(Math.min(...ys) + EPSILON),
    maxX: Math.ceil(Math.max(...xs) - EPSILON) - 1,
    maxY: Math.ceil(Math.max(...ys) - EPSILON) - 1,
  };
}

/** Bottom to top: by z, then id so equal z still draws the same way twice. */
export function dressingDrawOrder(layer: DressingLayer): Array<[string, DressingPlacement]> {
  return Object.entries(layer).sort(([idA, a], [idB, b]) => a.z - b.z || (idA < idB ? -1 : idA > idB ? 1 : 0));
}

/** One above the highest z in the layer, 0 when empty: a new prop lands on top. */
export function nextDressingZ(layer: DressingLayer): number {
  const placements = Object.values(layer);
  if (placements.length === 0) return 0;
  return Math.max(...placements.map((p) => p.z)) + 1;
}

/**
 * Id of the topmost placement whose rotated footprint contains the point.
 * `cellX` / `cellY` are fractional cell coordinates. The point is carried into
 * each placement's own unrotated frame, where the footprint is a plain box.
 */
export function hitTestDressing(layer: DressingLayer, catalog: DressingCatalog, cellX: number, cellY: number): string | null {
  const order = dressingDrawOrder(layer);
  for (let i = order.length - 1; i >= 0; i--) {
    const [id, placement] = order[i];
    const { w, h } = dressingFootprint(placement, catalog);
    const rad = (-placement.rotation * Math.PI) / 180;
    const centre = dressingCentre(placement, w, h);
    const dx = cellX - centre.x;
    const dy = cellY - centre.y;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) return id;
  }
  return null;
}

/**
 * Draws one prop. `originX` / `originY` is the pixel position of the anchor
 * cell's top-left. With no image yet, draws a footprint-shaped placeholder
 * rather than nothing, so a prop whose art is missing or still loading is
 * still visible, selectable and the right size.
 */
export function drawDressing(
  ctx: Ctx2D,
  placement: DressingPlacement,
  prop: DressingProp | undefined,
  originX: number,
  originY: number,
  tilePx: number,
  alpha = 1,
): void {
  const w = prop ? prop.footprint_w : 1;
  const h = prop ? prop.footprint_h : 1;
  const pw = w * tilePx;
  const ph = h * tilePx;
  const centre = dressingCentre(placement, w, h);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(originX + (centre.x - placement.x) * tilePx, originY + (centre.y - placement.y) * tilePx);
  ctx.rotate((placement.rotation * Math.PI) / 180);
  if (prop?.image) {
    ctx.drawImage(prop.image, -pw / 2, -ph / 2, pw, ph);
  } else {
    const inset = tilePx * 0.04;
    ctx.beginPath();
    ctx.roundRect(-pw / 2 + inset, -ph / 2 + inset, pw - inset * 2, ph - inset * 2, tilePx * 0.12);
    ctx.fillStyle = "rgba(150,140,125,0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(230,220,200,0.6)";
    ctx.lineWidth = Math.max(1, tilePx / 64);
    ctx.stroke();
  }
  ctx.restore();
}

/** The rotated footprint's outline, for a selected prop. */
export function strokeDressingOutline(
  ctx: Ctx2D,
  placement: DressingPlacement,
  w: number,
  h: number,
  originX: number,
  originY: number,
  tilePx: number,
  color: string,
): void {
  const centre = dressingCentre(placement, w, h);
  const cx = originX + (centre.x - placement.x) * tilePx;
  const cy = originY + (centre.y - placement.y) * tilePx;
  const rad = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = (w * tilePx) / 2;
  const hh = (h * tilePx) / 2;
  ctx.save();
  ctx.beginPath();
  [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].forEach(([dx, dy], i) => {
    const px = cx + dx * cos - dy * sin;
    const py = cy + dx * sin + dy * cos;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, tilePx / 32);
  ctx.stroke();
  ctx.restore();
}
