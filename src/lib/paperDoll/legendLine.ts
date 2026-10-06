export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LegendLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The hairline from a slot well to its spot on the figure, in the container's
 * own coordinates. A well in the left column leaves from its right edge, one in
 * the right column from its left edge, always at the well's vertical centre.
 * `anchor` is the spot on the figure in percent of the figure's box.
 */
export function legendLine(args: {
  well: Box;
  container: Box;
  figure: Box;
  anchor: { x: number; y: number };
  side: "left" | "right";
}): LegendLine {
  const { well, container, figure, anchor, side } = args;
  return {
    x1: (side === "left" ? well.left + well.width : well.left) - container.left,
    y1: well.top + well.height / 2 - container.top,
    x2: figure.left + (anchor.x / 100) * figure.width - container.left,
    y2: figure.top + (anchor.y / 100) * figure.height - container.top,
  };
}
