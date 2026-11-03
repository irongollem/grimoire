// The Table screen follows the turn without hunting: a token already comfortably on screen leaves the map where it
// is, and one near or past an edge brings it back to the middle. The margin is a fraction of the screen.

export const FOLLOW_MARGIN = 0.2;

/** How far to pan (in pixels, added to the current pan) so the token's middle sits inside the screen's inner box. */
export function panToKeepInView(input: {
  hostW: number;
  hostH: number;
  /** The token's middle in host pixels, where it is drawn now. */
  centre: { x: number; y: number };
}): { dx: number; dy: number } {
  const { hostW, hostH, centre } = input;
  const inside =
    centre.x >= hostW * FOLLOW_MARGIN &&
    centre.x <= hostW * (1 - FOLLOW_MARGIN) &&
    centre.y >= hostH * FOLLOW_MARGIN &&
    centre.y <= hostH * (1 - FOLLOW_MARGIN);
  if (inside) return { dx: 0, dy: 0 };
  return { dx: hostW / 2 - centre.x, dy: hostH / 2 - centre.y };
}
