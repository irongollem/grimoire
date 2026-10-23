// Straight wall runs along grid lines, for Shift+click with the Wall tool (#1096).
//
// Walls live on cell edges, and an edge is a unit segment between two grid
// vertices. A run is therefore a walk between two vertices along one axis.
// Pure geometry; the editor decides what to do with the edges.

import { canonicaliseEdge, type CellEdge } from "./edges";

export type Vertex = readonly [number, number];

/** Fractional cell coordinates to the nearest grid vertex. */
export function nearestVertex(fx: number, fy: number): [number, number] {
  return [Math.round(fx), Math.round(fy)];
}

/**
 * The two grid vertices an edge connects, whichever side it was named from.
 * Cell (x, y) spans vertices (x, y)..(x+1, y+1), so after canonicalising, a
 * north edge runs east along y and a west edge runs south along x.
 */
export function edgeVertices(edge: CellEdge): [Vertex, Vertex] {
  const c = canonicaliseEdge(edge.x, edge.y, edge.side);
  if (c.side === "N") return [[c.x, c.y], [c.x + 1, c.y]];
  return [[c.x, c.y], [c.x, c.y + 1]];
}

/**
 * Where a run starts after clicking an edge: the edge's end nearer `toward`,
 * so the run grows away from the click toward the pointer. A tie picks the first.
 */
export function runAnchor(edge: CellEdge, toward: Vertex): Vertex {
  const [a, b] = edgeVertices(edge);
  const da = (a[0] - toward[0]) ** 2 + (a[1] - toward[1]) ** 2;
  const db = (b[0] - toward[0]) ** 2 + (b[1] - toward[1]) ** 2;
  return db < da ? b : a;
}

/**
 * Lock a run to the dominant axis of (to - from), ties going horizontal, and
 * list the canonical edges covering it in walking order from `from`.
 */
export function wallRun(from: Vertex, target: Vertex): { edges: CellEdge[]; end: Vertex } {
  // Vertices are integers; rounding here keeps a fractional input from walking
  // past its target forever in the loops below.
  const [fx, fy] = nearestVertex(from[0], from[1]);
  const to = nearestVertex(target[0], target[1]);
  const dx = to[0] - fx;
  const dy = to[1] - fy;
  const edges: CellEdge[] = [];

  if (Math.abs(dx) >= Math.abs(dy)) {
    const step = dx < 0 ? -1 : 1;
    for (let x = fx; x !== to[0]; x += step) {
      // The unit segment x..x+1 is owned by cell column min(x, x+step).
      edges.push({ x: Math.min(x, x + step), y: fy, side: "N" });
    }
    return { edges, end: [to[0], fy] };
  }

  const step = dy < 0 ? -1 : 1;
  for (let y = fy; y !== to[1]; y += step) {
    edges.push({ x: fx, y: Math.min(y, y + step), side: "W" });
  }
  return { edges, end: [fx, to[1]] };
}
