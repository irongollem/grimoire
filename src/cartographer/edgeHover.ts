// Pointer-to-edge detection: given a world-pixel position, work out which
// cell the cursor is over and (if close enough to one of its edges) which
// edge should highlight.
//
// Used by the wall and door tools — the editor calls this on pointermove
// to drive the edge-highlight overlay. The writer canonicalises before
// storing.

import type { CellEdge, Side } from "./edges";

/**
 * @param worldX  X position in world pixels (after subtracting viewport offset).
 * @param worldY  Y position in world pixels.
 * @param tileSize  Pixel side length of a single cell at the current zoom.
 * @param threshold  Fraction of tileSize within which the cursor snaps to an edge (0–0.5).
 * @returns The cell + edge the cursor is targeting, or null if it sits past the threshold.
 *          The returned cell is the one the cursor is physically over — *not*
 *          the canonical owner. Use canonicaliseEdge() at write time.
 */
export function detectHoveredEdge(
  worldX: number,
  worldY: number,
  tileSize: number,
  threshold: number,
): CellEdge | null {
  // Cell the cursor is over (handles negative coordinates).
  const cellX = Math.floor(worldX / tileSize);
  const cellY = Math.floor(worldY / tileSize);

  // Offset of the cursor within that cell.
  const dx = worldX - cellX * tileSize;
  const dy = worldY - cellY * tileSize;

  // Distance to each edge.
  const distN = dy;
  const distS = tileSize - dy;
  const distW = dx;
  const distE = tileSize - dx;

  // Pick the nearest edge.
  let nearest: { side: Side; dist: number } = { side: "N", dist: distN };
  if (distE < nearest.dist) nearest = { side: "E", dist: distE };
  if (distS < nearest.dist) nearest = { side: "S", dist: distS };
  if (distW < nearest.dist) nearest = { side: "W", dist: distW };

  // Must be within the threshold band.
  if (nearest.dist > tileSize * threshold) return null;

  return { x: cellX, y: cellY, side: nearest.side };
}
