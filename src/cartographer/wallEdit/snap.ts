// Where a dragged wall node lands (epic #1125, canvas frame 17). Priority: another node, then onto a wall, then the grid
// (whole and half cells), then free. The dragged node's own walls and their far ends never attract it.

import type { WallGraph } from "./graph";
import { dist, projectOnSegment, type Pt } from "./geometry";

export type SnapTarget =
  | { kind: "node"; point: [number, number]; node: string }
  | { kind: "wall"; point: [number, number]; segment: string; run: string | undefined }
  | { kind: "grid"; point: [number, number] }
  | { kind: "free"; point: [number, number] };

export interface SnapOptions {
  /** The node being dragged (its id in `graph`), when it already exists. */
  dragged?: string;
  /** Pull radius to a node or wall, in cells. */
  tolerance?: number;
  /** Alt held: skip the grid and keep the point to 1/1000 cell. Nodes and walls still pull. */
  free?: boolean;
  /** Grid step in cells; half a cell by default. */
  step?: number;
}

export const SNAP_TOLERANCE = 0.25;

export function snapNode(point: Pt, graph: WallGraph, opts: SnapOptions = {}): SnapTarget {
  const tol = opts.tolerance ?? SNAP_TOLERANCE;
  const own = new Set<string>();
  const ownSegs = new Set<string>();
  if (opts.dragged) {
    own.add(opts.dragged);
    for (const key of graph.nodes.get(opts.dragged)?.segs ?? []) {
      ownSegs.add(key);
      const s = graph.segs.get(key)!;
      own.add(s.from);
      own.add(s.to);
    }
  }

  let node: SnapTarget | undefined;
  let nodeDist = Infinity;
  for (const n of graph.nodes.values()) {
    if (own.has(n.id)) continue;
    const d = dist(point, [n.x, n.y]);
    if (d <= tol && d < nodeDist) {
      node = { kind: "node", point: [n.x, n.y], node: n.id };
      nodeDist = d;
    }
  }
  if (node) return node;

  let wall: SnapTarget | undefined;
  let wallDist = Infinity;
  for (const s of graph.segs.values()) {
    if (ownSegs.has(s.key)) continue;
    const hit = projectOnSegment(point, s.wall.a, s.wall.b);
    if (hit.dist <= tol && hit.dist < wallDist) {
      wall = { kind: "wall", point: hit.foot, segment: s.key, run: graph.runOf.get(s.key) };
      wallDist = hit.dist;
    }
  }
  if (wall) return wall;

  if (opts.free) return { kind: "free", point: [Math.round(point[0] * 1000) / 1000, Math.round(point[1] * 1000) / 1000] };
  const step = opts.step ?? 0.5;
  return { kind: "grid", point: [Math.round(point[0] / step) * step, Math.round(point[1] / step) * step] };
}
