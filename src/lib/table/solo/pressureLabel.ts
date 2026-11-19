import type { TablePressure } from "./soloTypes";

/**
 * The clock in words, for a screen reader: the pips say nothing aloud. It counts what is left, which is what the
 * player acts on, and says so plainly once nothing is.
 */
export function pressureSpoken(pressure: TablePressure): string {
  const left = pressure.segments - pressure.filled;
  if (left <= 0) return "Out of time";
  return `Time is short: ${left} of ${pressure.segments} ${pressure.segments === 1 ? "turn" : "turns"} left`;
}

/**
 * The clock the page keeps once the player sends their next message. A full clock has done its work (what it counted
 * down to arrived in the reply that filled it, and the server let go of it), and no later event takes it off the
 * page, so it goes when the story moves on. A clock still counting stays.
 */
export function pressureAfterSend(pressure: TablePressure | null): TablePressure | null {
  return pressure !== null && pressure.filled >= pressure.segments ? null : pressure;
}
