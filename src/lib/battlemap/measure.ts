// The Measure tool's length (#1125 frame 11): "by the book (5 ft per square, diagonals included)". Every square
// along a line costs 5 ft, a diagonal square too (PHB 2014 "Movement and Position" / PHB 2024 "Moving"; the same
// count the move path uses), so a leg is worth as many squares as its longer side.

export type MeasurePoint = readonly [number, number];

const FEET_PER_SQUARE = 5;

/** The middle of the square a point is in: a measure starts and bends on squares, so it reads whole squares. */
export function snapToSquareMiddle(x: number, y: number): MeasurePoint {
  return [Math.floor(x) + 0.5, Math.floor(y) + 0.5];
}

/** The length of a line bent through its points, in feet. */
export function measureFeet(points: readonly MeasurePoint[]): number {
  let squares = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    squares += Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
  }
  return squares * FEET_PER_SQUARE;
}
