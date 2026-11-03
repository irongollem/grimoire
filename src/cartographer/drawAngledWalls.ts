// Walls that are not on a grid line (epic #1125 decision 5), and the dashed trace of walls marked `visible: false`.
// Pack edge art is a tile per grid edge, so an angled wall has none of its own: it gets the same textured ribbon a
// brushed curve gets (`wallRibbon.ts`, the pack's `wallSegmentH` art bent along the wall's line), straight or curved
// through its smooth nodes (`wallGeometry.ts`). A pack without wall art draws a band in its wall tone. A door on it is
// a pair of posts with a leaf rectangle between. Split from drawMap.ts, which calls `paintAngledWalls`.

import { WALL_BAND_RATIO } from "@/cartographer/packSchema";
import type { Ctx2D } from "@/cartographer/dressing";
import type { Frame, Target } from "@/cartographer/drawFrame";
import type { WallEdge } from "@/types/dungeonMap.types";
import { angledWalls, isDrawn, isLatticeKey } from "@/cartographer/wallGraph";
import { cachedWallGeometry, type WallLine } from "@/cartographer/wallGeometry";
import { paintRibbonPath, ribbonStrip, wallTone, type DevicePoint } from "@/cartographer/wallRibbon";

function inWindow(f: Frame, points: readonly (readonly [number, number])[]): boolean {
  const { bounds } = f;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return maxX >= bounds.minX - 1 && minX <= bounds.maxX + 2 && maxY >= bounds.minY - 1 && minY <= bounds.maxY + 2;
}

const toDevice = (f: Frame, t: Target, points: readonly (readonly [number, number])[]): DevicePoint[] =>
  points.map(([x, y]) => [x * f.tilePx - t.ox, y * f.tilePx - t.oy]);

/** One door leaf along a wall: closed it lies on the line, open it is turned a quarter about the first end. */
function paintLeaf(ctx: Ctx2D, wall: WallEdge, tilePx: number, t: Target, color: string): void {
  const ax = wall.a[0] * tilePx - t.ox;
  const ay = wall.a[1] * tilePx - t.oy;
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) * tilePx;
  const angle = Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]) + (wall.type === "doorOpen" ? Math.PI / 2 : 0);
  const thickness = tilePx * WALL_BAND_RATIO * 0.6;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(0, -thickness / 2, length, thickness);
  ctx.restore();
}

function strokePath(ctx: Ctx2D, points: readonly DevicePoint[]): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

/**
 * The angled walls in the draw window, and, in the editor, every hidden wall as a faint dashed line. A wall or sluice
 * is the textured ribbon along its line; a grate a thinner band; a door a pair of posts with its leaf between.
 */
export function paintAngledWalls(f: Frame, t: Target): void {
  const { tilePx, layers } = f;
  const { ctx } = t;
  const band = tilePx * WALL_BAND_RATIO;
  const geometry = cachedWallGeometry(layers.walls);
  const lineOf = (id: string, wall: WallEdge): WallLine => geometry.lines.get(id) ?? { pieces: [], path: [wall.a, wall.b], offset: 0, capStart: true, capEnd: true };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [id, wall] of angledWalls(layers)) {
    const line = lineOf(id, wall);
    if (!isDrawn(wall) || !inWindow(f, line.path)) continue;
    const r = f.runtime(wall.pack_id);
    const tone = wallTone(r);
    if (wall.type === "doorClosed" || wall.type === "doorOpen") {
      // The doorway is the posts at either end; the leaf is what turns.
      ctx.strokeStyle = tone;
      ctx.lineWidth = band;
      for (const end of [wall.a, wall.b]) {
        ctx.beginPath();
        ctx.moveTo(end[0] * tilePx - t.ox, end[1] * tilePx - t.oy);
        ctx.lineTo(end[0] * tilePx - t.ox, end[1] * tilePx - t.oy);
        ctx.stroke();
      }
      paintLeaf(ctx, wall, tilePx, t, tone);
      continue;
    }
    const points = toDevice(f, t, line.path);
    if (wall.type === "grate") {
      ctx.strokeStyle = tone;
      ctx.lineWidth = band * 0.5;
      strokePath(ctx, points);
      continue;
    }
    const strip = r ? ribbonStrip(r, wall.variant) : null;
    paintRibbonPath(ctx, points, strip, tilePx, tone, { startPx: line.offset * tilePx, capStart: line.capStart, capEnd: line.capEnd });
  }
  const hidden = f.showHiddenWalls
    ? Object.entries(layers.walls)
        .filter(([, wall]) => wall.visible === false)
        .map(([id, wall]) => (isLatticeKey(id) ? [wall.a, wall.b] : lineOf(id, wall).path))
        .filter((path) => inWindow(f, path))
    : [];
  if (hidden.length > 0) {
    ctx.strokeStyle = "rgba(200,170,90,0.75)";
    ctx.lineWidth = Math.max(1, tilePx * 0.04);
    ctx.setLineDash([tilePx * 0.12, tilePx * 0.1]);
    ctx.lineCap = "butt";
    for (const path of hidden) strokePath(ctx, toDevice(f, t, path));
  }
  ctx.restore();
}
