// What the editor draws over a selected wall run (epic #1125, canvas frame 17): the bones highlighted, a handle on each
// node (the hovered and the dragged one apart), and where a dragged node would land. Overlay only, never part of a bake.
// Plain values in, so it must not import "vue".

import type { Ctx2D } from "@/cartographer/dressing";
import type { SnapTarget } from "@/cartographer/wallEdit/snap";

export interface WallNodeMarks {
  /** Bones of the selected run, as the ids of their two ends, and the line drawn between them when it curves (cells). */
  bones: readonly { id: string; a: string; b: string; path?: readonly (readonly [number, number])[] }[];
  /** Nodes of the selected run, in cells. A smooth node (the wall curves through it) is round, a corner square. */
  nodes: readonly { id: string; x: number; y: number; smooth?: boolean }[];
  /** The bone Del would remove, drawn stronger. */
  focusBone?: string | null;
  /** The selected node stays marked after the pointer leaves or the drag ends. */
  focusNode?: string | null;
  hoverNode?: string | null;
  draggedNode?: string | null;
  snap?: SnapTarget | null;
}

const ACCENT = "rgba(80,180,255,0.9)";
const FOCUS = "rgba(255,220,100,0.95)";
const INK = "rgba(20,16,12,0.9)";

export function paintWallNodes(
  ctx: Ctx2D,
  marks: WallNodeMarks,
  tilePx: number,
  viewportOffset: { x: number; y: number },
): void {
  const px = (v: number): number => v * tilePx - viewportOffset.x;
  const py = (v: number): number => v * tilePx - viewportOffset.y;
  const at = new Map(marks.nodes.map((n) => [n.id, n]));

  ctx.save();
  ctx.lineCap = "round";
  for (const bone of marks.bones) {
    const a = at.get(bone.a);
    const b = at.get(bone.b);
    if (!a || !b) continue;
    const focused = bone.id === marks.focusBone;
    ctx.strokeStyle = focused ? FOCUS : ACCENT;
    ctx.lineWidth = Math.max(focused ? 5 : 4, tilePx * (focused ? 0.14 : 0.1));
    ctx.lineJoin = "round";
    ctx.beginPath();
    // A curved bone is highlighted along the curve it is drawn on, not along the chord between its nodes.
    const line = bone.path ?? [[a.x, a.y], [b.x, b.y]];
    line.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), py(y)) : ctx.lineTo(px(x), py(y))));
    ctx.stroke();
  }

  const r = Math.max(4, tilePx * 0.1);
  for (const n of marks.nodes) {
    const dragged = n.id === marks.draggedNode;
    const focused = n.id === marks.focusNode;
    const hovered = n.id === marks.hoverNode;
    const selected = dragged || focused;
    ctx.fillStyle = selected ? FOCUS : hovered ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.9)";
    ctx.strokeStyle = selected ? INK : ACCENT;
    ctx.lineWidth = selected || hovered ? 3 : 2;
    ctx.beginPath();
    const radius = selected || hovered ? r * 1.3 : r;
    if (n.smooth) ctx.arc(px(n.x), py(n.y), radius, 0, Math.PI * 2);
    else {
      // A corner is a square, so the two kinds read apart without colour.
      const half = radius * 0.9;
      ctx.moveTo(px(n.x) - half, py(n.y) - half);
      ctx.lineTo(px(n.x) + half, py(n.y) - half);
      ctx.lineTo(px(n.x) + half, py(n.y) + half);
      ctx.lineTo(px(n.x) - half, py(n.y) + half);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }

  // The landing point: a ring around a node it joins, a diamond on a wall it snaps onto, a cross on the grid.
  const s = marks.snap;
  if (s) {
    const x = px(s.point[0]);
    const y = py(s.point[1]);
    ctx.strokeStyle = s.kind === "node" || s.kind === "wall" ? FOCUS : ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (s.kind === "node") ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    else if (s.kind === "wall") {
      ctx.moveTo(x, y - r * 1.8);
      ctx.lineTo(x + r * 1.8, y);
      ctx.lineTo(x, y + r * 1.8);
      ctx.lineTo(x - r * 1.8, y);
      ctx.closePath();
    } else {
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
    }
    ctx.stroke();
  }
  ctx.restore();
}
