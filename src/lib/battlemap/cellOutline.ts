export interface CellEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The perimeter of a set of cells, as edges in cell units: a side is drawn where the neighbour on that side is not in
 * the set, so an L-shaped room outlines as an L rather than as its bounding box. Callers scale the edges to pixels.
 */
export function cellOutline(cells: readonly string[]): CellEdge[] {
  const set = new Set<string>(cells);
  const edges: CellEdge[] = [];
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number);
    if (!set.has(`${x},${y - 1}`)) edges.push({ x1: x, y1: y, x2: x + 1, y2: y });
    if (!set.has(`${x},${y + 1}`)) edges.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
    if (!set.has(`${x - 1},${y}`)) edges.push({ x1: x, y1: y, x2: x, y2: y + 1 });
    if (!set.has(`${x + 1},${y}`)) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
  }
  return edges;
}
