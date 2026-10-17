// Drawing for brushed areas (epic #1073, story 8). The geometry is `area.ts`; this turns it into pixels.
//
// An area cell is not drawn as a square. Its floor tile is laid as a full square and clipped to the smoothed outline,
// so the shape the brush made is the shape on screen. The outline's wall stretches are drawn as a ribbon of the pack's
// `wallSegmentH` art bent along the curve, one slice per outline segment, the source offset running on from one slice
// to the next so the texture is continuous. The same ribbon goes into the shadow silhouette, so a curved wall throws
// the shadow a straight one does.

import { WALL_BAND_RATIO, type PackCategory } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { areaOutline, type AreaOutline, type OutlineLoop } from "@/cartographer/area";
import type { Frame, Target } from "@/cartographer/drawFrame";
import { cellKey, parseCellKey, type AreaCell, type CellKey } from "@/types/dungeonMap.types";

export type VariantAt = (r: TilePackRuntime, category: PackCategory, x: number, y: number, stored: number) => number;

interface CachedLoop extends OutlineLoop {
  /** Bounding box in cell units, so loops far off screen are skipped. */
  box: { minX: number; minY: number; maxX: number; maxY: number };
}

interface CachedOutline {
  floor: object;
  loops: CachedLoop[];
}

// The outline is a flood of marching squares over the whole area; the editor redraws on every pointer move, so it is
// kept per `layers.area` object. `floor` is part of the key because plain floor counts as covered in the trace.
const outlines = new WeakMap<object, CachedOutline>();

export function cachedAreaLoops(layers: Frame["layers"]): CachedLoop[] {
  const hit = outlines.get(layers.area);
  if (hit && hit.floor === layers.floor) return hit.loops;
  const outline: AreaOutline = areaOutline(layers);
  const loops = outline.loops.map((loop): CachedLoop => {
    const xs = loop.points.map((p) => p[0]);
    const ys = loop.points.map((p) => p[1]);
    return { ...loop, box: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } };
  });
  outlines.set(layers.area, { floor: layers.floor, loops });
  return loops;
}

function loopVisible(loop: CachedLoop, b: Frame["bounds"]): boolean {
  // The wall band reaches half a band past the line, well inside one cell.
  return loop.box.maxX >= b.minX - 1 && loop.box.minX <= b.maxX + 2 && loop.box.maxY >= b.minY - 1 && loop.box.minY <= b.maxY + 2;
}

/** Floor of every area cell in the window, clipped to the brushed outline. Plain floor cells are `paintGround`'s. */
export function paintAreaGround(f: Frame, t: Target, variantAt: VariantAt): void {
  const { tilePx, bounds, layers, runtime } = f;
  const cells: [number, number, AreaCell][] = [];
  for (const key of Object.keys(layers.area) as CellKey[]) {
    const [x, y] = parseCellKey(key);
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
    // Water drawn on the cell takes the place of its floor, as it does for a plain floor cell.
    const terrain = layers.terrain[key];
    if (terrain && (runtime(terrain.pack_id)?.variantCount("terrainWater") ?? 0) > 0) continue;
    cells.push([x, y, layers.area[key]]);
  }
  if (cells.length === 0) return;

  const { ctx } = t;
  ctx.save();
  ctx.beginPath();
  for (const loop of cachedAreaLoops(layers)) {
    if (!loopVisible(loop, bounds)) continue;
    loop.points.forEach(([px, py], i) => {
      const sx = px * tilePx - t.ox;
      const sy = py * tilePx - t.oy;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
  }
  // Nonzero: a hole in a brushed shape runs the other way round and stays out.
  ctx.clip();
  for (const [x, y, cell] of cells) {
    const r = runtime(cell.pack_id);
    if (!r) continue;
    const tile = r.getTile("floor", variantAt(r, "floor", x, y, cell.variant));
    ctx.drawImage(tile.source, x * tilePx - t.ox, y * tilePx - t.oy, tilePx, tilePx);
  }
  ctx.restore();
}

/** The pack of the cell on the covered (left) side of a segment, falling back to the other side, then plain floor. */
function packAlong(f: Frame, a: [number, number], b: [number, number]): string | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nudge = 0.05;
  // Left of travel in y-down is (dy, -dx).
  const lx = (dy / len) * nudge;
  const ly = (-dx / len) * nudge;
  const at = (x: number, y: number): string | null => {
    const key = cellKey(Math.floor(x), Math.floor(y));
    return f.layers.area[key]?.pack_id ?? f.layers.floor[key]?.floor?.pack_id ?? null;
  };
  return at(mx + lx, my + ly) ?? at(mx - lx, my - ly);
}

/** Overlap between neighbouring slices, as a fraction of the band, so a turn shows no wedge of gap. */
const SLICE_OVERLAP = 0.3;

/**
 * The wall line of every stroked outline segment. With `wallSegmentH` art each segment is a slice of the wall tile
 * rotated onto the segment, the slice's source x running on with the accumulated length of the loop; without it a
 * plain stroke in the pack's wall colour.
 */
export function paintAreaWalls(f: Frame, t: Target): void {
  const { tilePx, bounds, layers, runtime } = f;
  if (Object.keys(layers.area).length === 0) return;
  const { ctx } = t;
  const thick = tilePx * WALL_BAND_RATIO;

  for (const loop of cachedAreaLoops(layers)) {
    if (!loopVisible(loop, bounds)) continue;
    const n = loop.points.length;
    let travelled = 0; // pixels of loop length drawn or skipped so far: the texture runs on through unstroked stretches
    for (let i = 0; i < n; i++) {
      const a = loop.points[i];
      const b = loop.points[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * tilePx;
      const from = travelled;
      travelled += len;
      if (!loop.stroke[i] || len === 0) continue;
      const packId = packAlong(f, a, b);
      const r = packId ? runtime(packId) : null;
      if (!r) continue;

      const ax = a[0] * tilePx - t.ox;
      const ay = a[1] * tilePx - t.oy;
      const bx = b[0] * tilePx - t.ox;
      const by = b[1] * tilePx - t.oy;
      const art = r.variantCount("wallSegmentH") > 0 ? r.getTile("wallSegmentH", 0) : null;
      if (!art || art.isPlaceholder) {
        const [cr, cg, cb] = r.manifest.palette?.wallSegmentH ?? [40, 36, 32];
        ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
        ctx.lineWidth = thick;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        continue;
      }

      // Source pixels per drawn pixel; the strip sits in the middle of the tile, WALL_BAND_RATIO of its height.
      const base = r.manifest.base_tile_size;
      const per = base / tilePx;
      const stripY = base * (0.5 - WALL_BAND_RATIO / 2);
      const stripH = base * WALL_BAND_RATIO;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(by - ay, bx - ax));
      const drawLen = len + thick * SLICE_OVERLAP;
      let done = 0;
      let source = (from * per) % base;
      while (done < drawLen) {
        const run = Math.min(drawLen - done, Math.max((base - source) / per, 1e-3));
        ctx.drawImage(art.source, source, stripY, run * per, stripH, done, -thick / 2, run, thick);
        done += run;
        source = (source + run * per) % base;
      }
      ctx.restore();
    }
  }
}
