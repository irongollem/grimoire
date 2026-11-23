import type { CanonForceTick } from "@/types/canon.types";

/**
 * A force's clock, as a number: the sum of its ticks, never past its size or below nothing. The ticks keep whatever
 * was written. Pure and in `lib` because the Canon page, the quest and faction pages and Tonight all read it, and a
 * `lib` module may not reach into a composable for it.
 */
export function clockFilled(ticks: readonly Pick<CanonForceTick, "delta">[], size: number): number {
  const sum = ticks.reduce((total, t) => total + t.delta, 0);
  return Math.min(size, Math.max(0, sum));
}
