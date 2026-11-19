// How long a sitting at the table lasts (#1021 row 25). Pure: no I/O, the time is handed in.
//
// Two things, both the maintainer's (18 Nov 2026). A long pause ends a sitting by itself: nothing made a player
// leave, so a laptop that sleeps and wakes kept one sitting going indefinitely, and a sitting that is never left
// writes no session note. And a sitting that has simply gone on for a long time is offered a fresh one, never
// forced into it: "the session has been going on for a long time, perhaps we can continue in a new segment that
// way we can create session notes", since one enormous sitting serves the player no better than it serves us.

const HOUR = 60 * 60 * 1000;

/** The server's own rule (`_shared/agent/sittingEnd.ts`), mirrored so the page can end a sitting before a turn is typed. */
export const SITTING_ENDS_AFTER_IDLE_MS = 6 * HOUR;

/** Whether the pause since the table last moved has ended the sitting. An unknown last move ends nothing. */
export function endedByPause(lastActiveMs: number | null, nowMs: number): boolean {
  return lastActiveMs !== null && nowMs - lastActiveMs >= SITTING_ENDS_AFTER_IDLE_MS;
}

/** A sitting is long after four hours or eighty turns of the player's, whichever comes first. app convention: an evening of play. */
export const LONG_SITTING_MS = 4 * HOUR;
export const LONG_SITTING_TURNS = 80;
/** "Not now" is asked again after this much more play, not at once and not never. */
export const ASK_AGAIN_MS = 2 * HOUR;
export const ASK_AGAIN_TURNS = 40;

/** When the player last said "not now" to a new sitting. */
export interface NotNow {
  atMs: number;
  turns: number;
}

/**
 * Whether to offer a new sitting now. Measured from when the sitting began, or from the last "not now": both the
 * clock and the count start over there, so declining buys a real stretch of play.
 */
export function offersNewSitting(input: { startedMs: number | null; turns: number; nowMs: number; notNow: NotNow | null }): boolean {
  const { startedMs, turns, nowMs, notNow } = input;
  if (notNow !== null) return nowMs - notNow.atMs >= ASK_AGAIN_MS || turns - notNow.turns >= ASK_AGAIN_TURNS;
  return (startedMs !== null && nowMs - startedMs >= LONG_SITTING_MS) || turns >= LONG_SITTING_TURNS;
}
