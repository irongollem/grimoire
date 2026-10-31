// Walls that are not on a grid line (epic #1125 decision 5), and the dashed trace of walls marked `visible: false`.
// Pack edge art is a tile per grid edge, so an angled wall has none: it is a stroked line in the pack's wall tone, and
// a door on it is a pair of posts with a leaf rectangle between. Split from drawMap.ts, which calls `paintAngledWalls`.

import { WALL_BAND_RATIO } from "@/cartographer/packSchema";
import type { Ctx2D } from "@/cartographer/dressing";
import type { Frame, Target } from "@/cartographer/drawFrame";
import type { WallEdge } from "@/types/dungeonMap.types";
import { angledWalls, isDrawn } from "@/cartographer/wallGraph";

/** Wall tone when the pack declares no palette: the stone default the joint fallback uses. */
const FALLBACK_TONE: [number, number, number] = [40, 36, 32];

function toneOf(f: Frame, wall: WallEdge): string {
  const pal = f.runtime(wall.pack_id)?.manifest.palette;
  const [r, g, b] = pal?.wallSegmentH ?? FALLBACK_TONE;
  return `rgb(${r},${g},${b})`;
}

function inWindow(f: Frame, wall: WallEdge): boolean {
  const { bounds } = f;
  const minX = Math.min(wall.a[0], wall.b[0]);
  const maxX = Math.max(wall.a[0], wall.b[0]);
  const minY = Math.min(wall.a[1], wall.b[1]);
  const maxY = Math.max(wall.a[1], wall.b[1]);
  return maxX >= bounds.minX - 1 && minX <= bounds.maxX + 2 && maxY >= bounds.minY - 1 && minY <= bounds.maxY + 2;
}

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

function line(ctx: Ctx2D, wall: WallEdge, tilePx: number, t: Target): void {
  ctx.beginPath();
  ctx.moveTo(wall.a[0] * tilePx - t.ox, wall.a[1] * tilePx - t.oy);
  ctx.lineTo(wall.b[0] * tilePx - t.ox, wall.b[1] * tilePx - t.oy);
  ctx.stroke();
}

/**
 * The angled walls in the draw window, and, in the editor, every hidden wall as a faint dashed line. A wall or sluice
 * is a band stroke; a grate a thinner one; a door a pair of posts with its leaf between.
 */
export function paintAngledWalls(f: Frame, t: Target): void {
  const { tilePx, layers } = f;
  const { ctx } = t;
  const band = tilePx * WALL_BAND_RATIO;
  ctx.save();
  ctx.lineCap = "round";
  for (const [, wall] of angledWalls(layers)) {
    if (!isDrawn(wall) || !inWindow(f, wall)) continue;
    const tone = toneOf(f, wall);
    ctx.strokeStyle = tone;
    if (wall.type === "doorClosed" || wall.type === "doorOpen") {
      // The doorway is the posts at either end; the leaf is what turns.
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
    ctx.lineWidth = wall.type === "grate" ? band * 0.5 : band;
    line(ctx, wall, tilePx, t);
  }
  const hidden = f.showHiddenWalls
    ? Object.values(layers.walls).filter((wall) => wall.visible === false && inWindow(f, wall))
    : [];
  if (hidden.length > 0) {
    ctx.strokeStyle = "rgba(200,170,90,0.75)";
    ctx.lineWidth = Math.max(1, tilePx * 0.04);
    ctx.setLineDash([tilePx * 0.12, tilePx * 0.1]);
    ctx.lineCap = "butt";
    for (const wall of hidden) line(ctx, wall, tilePx, t);
  }
  ctx.restore();
}
