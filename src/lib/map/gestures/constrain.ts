// Shift-constraint geometry for the map editor (#1096).
//
// Photoshop and Figma agree that holding Shift while dragging locks a stroke to
// a straight line (every 45 degrees) or a shape to a square. These helpers are
// the pure maths for that. Like the sibling gesture modules, a gesture produces
// geometry; the editor decides what it means (paint, wall, erase).

/**
 * Snap `to` onto the nearest ray from `from` at a multiple of `stepDeg`.
 * Works in fractional cells for the round brush. The pointer is projected
 * orthogonally onto the chosen ray, so the stroke keeps the length the user
 * dragged rather than stretching to the pointer's bounding box.
 */
export function snapToAngle(
  from: readonly [number, number],
  to: readonly [number, number],
  stepDeg = 45,
): [number, number] {
  const [fx, fy] = from;
  const dx = to[0] - fx;
  const dy = to[1] - fy;
  if (dx === 0 && dy === 0) return [fx, fy];

  // The nearest ray by angle is within half a step of the pointer, so for any
  // sensible step (< 180) the projection below is never negative.
  const deg = Math.round(Math.atan2(dy, dx) / ((stepDeg * Math.PI) / 180)) * stepDeg;
  const norm = ((deg % 360) + 360) % 360;

  // Axis-aligned rays get exact unit vectors: cos(90deg) is 6e-17, and that
  // noise would leak into the coordinate that must stay exactly `from`'s.
  let ux: number;
  let uy: number;
  if (norm % 180 === 0) {
    ux = norm === 0 ? 1 : -1;
    uy = 0;
  } else if (norm % 180 === 90) {
    ux = 0;
    uy = norm === 90 ? 1 : -1;
  } else {
    const rad = (deg * Math.PI) / 180;
    ux = Math.cos(rad);
    uy = Math.sin(rad);
  }

  const t = Math.max(0, dx * ux + dy * uy);
  return [fx + t * ux, fy + t * uy];
}

/**
 * Integer-cell version for cell tools (line tool, tile painting): the result is
 * horizontal, vertical or an exact diagonal, whichever is nearest by angle.
 * A diagonal's length is the rounded projection so the end stays near the pointer.
 */
export function snapCellToAngle(ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return [ax, ay];

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const angle = (Math.atan2(ady, adx) * 180) / Math.PI; // 0..90
  if (angle < 22.5) return [bx, ay];
  if (angle > 67.5) return [ax, by];

  // Both components are non-zero here, so both signs are real.
  const n = Math.round((adx + ady) / 2);
  return [ax + Math.sign(dx) * n, ay + Math.sign(dy) * n];
}

/**
 * Opposite corner of a square anchored at (ax, ay) for Shift+rectangle. The
 * side is the longer drag axis; a zero axis counts as positive so a straight
 * horizontal or vertical drag still grows a square.
 */
export function squareCorner(ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  return [ax + sx * side, ay + sy * side];
}
