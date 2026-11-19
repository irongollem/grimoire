/**
 * The turn card's movement bar is two speeds long: the first half is the speed, the second a Dash. Returns the
 * share of the bar (0 to 1) the moved feet fill, and where the Dash half begins. Past twice the speed it just fills.
 */
export function moveBarShares(used: number, speed: number): { moved: number; dashFrom: number } {
  if (speed <= 0) return { moved: used > 0 ? 1 : 0, dashFrom: 0.5 };
  return { moved: Math.min(1, used / (speed * 2)), dashFrom: 0.5 };
}
