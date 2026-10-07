/**
 * Geometry for the progress-clock dial (#1011): N equal wedges of a ring, drawn
 * clockwise from twelve o'clock. Pure so the shape is testable without a DOM.
 */

const TAU = Math.PI * 2;
/** Angular gap between neighbouring wedges, in radians, so segments read as separate. */
const GAP = 0.07;

function point(cx: number, cy: number, radius: number, angle: number): string {
  // angle 0 is twelve o'clock, increasing clockwise.
  const x = cx + radius * Math.sin(angle);
  const y = cy - radius * Math.cos(angle);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** SVG path for wedge `index` of `segments` in a ring between two radii. */
export function clockSegmentPath(
  index: number,
  segments: number,
  center: number,
  outer: number,
  inner: number,
): string {
  const span = TAU / segments;
  const start = index * span + GAP / 2;
  const end = (index + 1) * span - GAP / 2;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${point(center, center, outer, start)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${point(center, center, outer, end)}`,
    `L ${point(center, center, inner, end)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${point(center, center, inner, start)}`,
    "Z",
  ].join(" ");
}

/** "3 of 4": the dial's accessible name. */
export function clockProgressLabel(filled: number, segments: number): string {
  return `${filled} of ${segments}`;
}
