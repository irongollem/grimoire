// What the editor draws over a selected wall run (epic #1125, canvas frame 17): the bones highlighted, a handle on each
// node (the hovered and the dragged one apart), and where a dragged node would land. Overlay only, never part of a bake.
// Plain values in, so it must not import "vue".

import type { Ctx2D } from "@/cartographer/dressing";
import type { SnapTarget } from "@/cartographer/wallEdit/snap";

export interface WallNodeMarks {
  /** Bones of the selected run, as the ids of their two ends. */
  bones: readonly { id: string; a: string; b: string }[];
  /** Nodes of the selected run, in cells. */
  nodes: readonly { id: string; x: number; y: number }[];
  /** The bone Del would remove, drawn stronger. */
  focusBone?: string | null;
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
    ctx.beginPath();
    ctx.moveTo(px(a.x), py(a.y));
    ctx.lineTo(px(b.x), py(b.y));
    ctx.stroke();
  }

  const r = Math.max(4, tilePx * 0.1);
  for (const n of marks.nodes) {
    const dragged = n.id === marks.draggedNode;
    const hovered = n.id === marks.hoverNode;
    ctx.fillStyle = dragged ? FOCUS : hovered ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.9)";
    ctx.strokeStyle = dragged ? INK : ACCENT;
    ctx.lineWidth = dragged || hovered ? 3 : 2;
    ctx.beginPath();
    ctx.arc(px(n.x), py(n.y), dragged || hovered ? r * 1.3 : r, 0, Math.PI * 2);
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
