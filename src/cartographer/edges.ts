// Edge geometry — the canonical "NW ownership" rule for cell-edge walls.
//
// Background: a wall between two cells (x1,y1) and (x2,y2) needs ONE owner
// so we don't store the same wall twice. We pick the canonical owner using
// the NW rule:
//
//   - Cell (x, y) owns its NORTH edge (between (x, y-1) and (x, y)) → wallN.
//   - Cell (x, y) owns its WEST  edge (between (x-1, y) and (x, y)) → wallW.
//   - The SOUTH edge of (x, y) is owned by (x, y+1) as its N.
//   - The EAST  edge of (x, y) is owned by (x+1, y) as its W.
//
// Writers always canonicalise before storing; readers look up either the
// cell's own wallN/wallW or the appropriate neighbour's wallN/wallW.

export type Side = "N" | "E" | "S" | "W";
export type CanonicalSide = "N" | "W";

export interface CanonicalEdge {
  x: number;
  y: number;
  side: CanonicalSide;
}

export interface CellEdge {
  x: number;
  y: number;
  side: Side;
}

/**
 * Resolve any cell+side reference to its canonical NW-ownership owner.
 * The returned record points at the cell that physically stores the wall.
 */
export function canonicaliseEdge(x: number, y: number, side: Side): CanonicalEdge {
  switch (side) {
    case "N": return { x, y, side: "N" };
    case "W": return { x, y, side: "W" };
    case "S": return { x, y: y + 1, side: "N" };
    case "E": return { x: x + 1, y, side: "W" };
  }
}

/**
 * Given a canonical edge (the storage owner), return how the other cell
 * sees it (its non-canonical side). Useful when the editor wants to keep
 * the visual highlight on the cell the user is actually pointing at,
 * rather than jumping to the canonical-owner cell.
 */
export function otherEnd(edge: CanonicalEdge): CellEdge {
  if (edge.side === "N") return { x: edge.x, y: edge.y - 1, side: "S" };
  return { x: edge.x - 1, y: edge.y, side: "E" };
}

/**
 * Which wall-joint tile belongs at a grid corner, given the four wall segments
 * meeting there. Returns null when the corner needs no joint tile: fewer than
 * two walls, or exactly two that run straight through (collinear).
 *
 * Shared by the live editor's renderer and the bake/export pipeline, which
 * must agree — a corner that renders as a cross but bakes as a straight run is
 * a visible seam in the exported map.
 */
export function classifyJoint(wH: boolean, eH: boolean, nV: boolean, sV: boolean): string | null {
  const count = [wH, eH, nV, sV].filter(Boolean).length;
  if (count === 4) return "CROSS";
  if (count === 3) {
    if (!nV) return "T_N";
    if (!eH) return "T_E";
    if (!sV) return "T_S";
    if (!wH) return "T_W";
  }
  if (count === 2) {
    if (nV && eH) return "L_NE";
    if (sV && eH) return "L_SE";
    if (sV && wH) return "L_SW";
    if (nV && wH) return "L_NW";
  }
  return null; // 0, 1, or 2 collinear walls — no joint
}
