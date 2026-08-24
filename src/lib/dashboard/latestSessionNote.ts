import type { Note } from "@/types/notes.types";

/**
 * Picking the newest session note (#764).
 *
 * "Newest" is not one field, and that is the whole reason this is a module
 * with tests rather than a `.sort()` in a template. A session note carries
 * three different ideas of when it happened, and campaigns are inconsistent
 * about which they fill in:
 *
 * - `session_num` — what the DM calls it. Authoritative when present, because
 *   it is the only one the DM chose deliberately.
 * - `session_real_date` — the real-world date the session was played. Right
 *   when numbers are absent, and stable across notes written out of order.
 * - `created_at` — when the row was written. Always present, and the only one
 *   that cannot be wrong, but it says when the note was *typed up*, which for
 *   a DM writing three back-dated recaps on a Sunday is not session order.
 *
 * So they are consulted in that order, each as a tie-break on the last. A
 * campaign that numbers its sessions gets the number; one that does not falls
 * back to when it was played; one that does neither gets the row order, which
 * is at least deterministic.
 */

/** Notes missing a field sort *below* notes that have one — an unnumbered
 *  session is not session zero, it is a session that did not say. */
function compareOptionalDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function realDateValue(note: Note): number | null {
  if (note.session_real_date === null) return null;
  const parsed = Date.parse(note.session_real_date);
  // An unparseable date is data we cannot order by; treat it as absent rather
  // than letting NaN silently win or lose every comparison it takes part in.
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The newest session note, or `undefined` when the campaign has none.
 *
 * `undefined` means "no session notes"; callers must not conflate it with a
 * query that has not loaded — those are different cards.
 */
export function latestSessionNote(notes: readonly Note[]): Note | undefined {
  const sessions = notes.filter((note) => note.category === "session");
  if (sessions.length === 0) return undefined;

  return [...sessions].sort((a, b) => {
    const byNumber = compareOptionalDesc(a.session_num, b.session_num);
    if (byNumber !== 0) return byNumber;

    const byPlayed = compareOptionalDesc(realDateValue(a), realDateValue(b));
    if (byPlayed !== 0) return byPlayed;

    return Date.parse(b.created_at) - Date.parse(a.created_at);
  })[0];
}
