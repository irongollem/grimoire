// ── Durable site state, with provenance and undo (#787, epic #780) ──────────
//
// What is explored, cleared and looted is a fact about the *world*, not about
// whichever quest happened to be running when the party learned it — two
// quest chains routinely converge on the same vault, and a fact hung off a
// beat would let them disagree about the same room. It hangs off the
// location instead.
//
// `public.location_state_events` (migration `20260904062741`) is an
// APPEND-ONLY log: UPDATE and DELETE are revoked from `authenticated`, so
// there is no such thing as editing or deleting an assertion. Undo is
// appending the opposite `value` — the log is the history, never rewritten.
//
// `public.location_state` is the derived "current answer" view: `distinct on
// (location_id, fact)` newest-first, so it holds at most one row per fact per
// location, and only for facts that have ever been asserted at all. A
// location with NO row for a fact has never had it asserted — that is
// "unknown", not "false" — and every reader of this type must keep the two
// distinct rather than treating a missing row as `value: false`.

export const LOCATION_STATE_FACTS = ["explored", "cleared", "looted"] as const;
export type LocationStateFact = (typeof LOCATION_STATE_FACTS)[number];

export const LOCATION_STATE_FACT_LABELS: Record<LocationStateFact, string> = {
  explored: "Explored",
  cleared: "Cleared",
  looted: "Looted",
};

/** One row of the append-only log. */
export interface LocationStateEvent {
  id: string;
  user_id: string;
  location_id: string;
  fact: LocationStateFact;
  /** What this event asserts. `false` is how a prior `true` is taken back —
   *  never a row deletion. */
  value: boolean;
  /** "we only got as far as the nave", "the Drowned Bell party had it first". */
  note: string | null;
  created_at: string;
}

export interface LocationStateEventInsert {
  location_id: string;
  fact: LocationStateFact;
  value: boolean;
  note?: string | null;
}

/**
 * One row of the `location_state` view — the newest assertion per
 * (location, fact). There is no update path for this shape: a new answer is
 * a new `LocationStateEventInsert`, never a patch to a row of this type.
 */
export interface LocationState {
  location_id: string;
  fact: LocationStateFact;
  value: boolean;
  asserted_by: string;
  asserted_note: string | null;
  asserted_at: string;
}
