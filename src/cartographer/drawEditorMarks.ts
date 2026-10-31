// What the editor draws over the map for the Angled wall and Light tools (#1125 story 5): the run being drawn, the
// selected wall, and the placed lights with their reach. Overlay only, never part of a bake. Plain values in, so it
// must not import "vue".

import { FEET_PER_CELL, type TileLight } from "@/cartographer/packSchema";
import type { Ctx2D } from "@/cartographer/dressing";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";
import type { CellPoint } from "@/cartographer/wallPick";
import { paintWallNodes, type WallNodeMarks } from "@/cartographer/drawWallNodes";

export interface EditorMarks {
  /** The Angled wall run in progress and the snapped point the next click would add. */
  wallRun?: { points: CellPoint[]; hover: CellPoint | null } | null;
  selectedWallId?: string | null;
  /** The wall run Select picked (#1125 frame 17): its bones, its draggable nodes and where a drag would land. */
  wallNodes?: WallNodeMarks | null;
  /** The Light tool is active: every placed light is marked with its reach. */
  showLights?: boolean;
  selectedLightId?: string | null;
  /** Where the next light would go, with what it is made of. */
  lightGhost?: { point: CellPoint; light: TileLight } | null;
}

const ACCENT = "rgba(80,180,255,0.9)";

function reachRings(ctx: Ctx2D, cx: number, cy: number, light: TileLight, tilePx: number, dashed: boolean): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = light.color;
  ctx.setLineDash(dashed ? [6, 4] : []);
  for (const feet of [light.bright, light.bright + light.dim]) {
    if (feet <= 0) continue;
    ctx.beginPath();
    ctx.arc(cx, cy, (feet / FEET_PER_CELL) * tilePx, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function lightDot(ctx: Ctx2D, cx: number, cy: number, light: TileLight, tilePx: number, selected: boolean): void {
  const r = Math.max(5, tilePx * 0.12);
  ctx.save();
  ctx.fillStyle = light.color;
  ctx.strokeStyle = selected ? ACCENT : "rgba(20,16,12,0.9)";
  ctx.lineWidth = selected ? 3 : 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function paintEditorMarks(
  ctx: Ctx2D,
  layers: DungeonMapLayers,
  marks: EditorMarks,
  tilePx: number,
  viewportOffset: { x: number; y: number },
): void {
  const px = (v: number): number => v * tilePx - viewportOffset.x;
  const py = (v: number): number => v * tilePx - viewportOffset.y;

  const selectedWall = marks.selectedWallId ? layers.walls[marks.selectedWallId] : undefined;
  if (selectedWall) {
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = Math.max(4, tilePx * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px(selectedWall.a[0]), py(selectedWall.a[1]));
    ctx.lineTo(px(selectedWall.b[0]), py(selectedWall.b[1]));
    ctx.stroke();
    ctx.restore();
  }

  if (marks.wallNodes) paintWallNodes(ctx, marks.wallNodes, tilePx, viewportOffset);

  const run = marks.wallRun;
  if (run && run.points.length > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,220,100,0.9)";
    ctx.fillStyle = "rgba(255,220,100,0.9)";
    ctx.lineWidth = Math.max(3, tilePx * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    run.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y))));
    ctx.stroke();
    // The next segment, dashed: where a click would take the run.
    const last = run.points[run.points.length - 1];
    if (run.hover) {
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(px(last[0]), py(last[1]));
      ctx.lineTo(px(run.hover[0]), py(run.hover[1]));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const [x, y] of run.points) {
      ctx.beginPath();
      ctx.arc(px(x), py(y), Math.max(3, tilePx * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (marks.showLights) {
    for (const [id, placed] of Object.entries(layers.lights)) {
      const selected = id === marks.selectedLightId;
      reachRings(ctx, px(placed.x), py(placed.y), placed.light, tilePx, !selected);
      lightDot(ctx, px(placed.x), py(placed.y), placed.light, tilePx, selected);
    }
    if (marks.lightGhost) {
      const { point, light } = marks.lightGhost;
      reachRings(ctx, px(point[0]), py(point[1]), light, tilePx, true);
    }
  }
}
