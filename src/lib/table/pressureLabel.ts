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
