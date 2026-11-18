// When a sitting at the table is over by itself (#1021 row 25).
//
// Nothing makes a player leave, and a laptop that sleeps and wakes kept one sitting going for as long as its tab
// lived (the maintainer, 18 Nov 2026: "a single session going for 365 days"). A sitting that is never left never
// writes its session note and never closes the play session it opened. So a long pause ends it: the next request is
// refused with `sitting_ended`, and the page leaves the table the way the Leave button does and offers to sit down
// again where the story stopped. Pure: no I/O.

/** A night's sleep ends a sitting; a meal does not. app convention. `src/lib/table/sittingLength.ts` mirrors it. */
export const SITTING_ENDS_AFTER_IDLE_MS = 6 * 60 * 60 * 1000;

/**
 * Whether the sitting last moved so long ago that it is over. A time that cannot be read ends nothing: refusing a
 * turn over a malformed timestamp would lock a player out of a table that is fine.
 */
export function endedByPause(lastActiveIso: string, nowMs: number): boolean {
  const last = Date.parse(lastActiveIso);
  if (Number.isNaN(last)) return false;
  return nowMs - last >= SITTING_ENDS_AFTER_IDLE_MS;
}
