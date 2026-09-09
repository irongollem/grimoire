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

// ── Door facts (#868) ────────────────────────────────────────────────────────
//
// A way out's `starts_locked` and `is_secret` are what the DM prepared; whether
// the party has since *unlocked* or *found* it is play state and goes in this
// same log, keyed by `door_id` (migration `20260908215644`). No second log: a
// door fact is asserted, undone and read exactly like a room fact. Its
// `location_id` is the SITE the door's two spaces share — the DB guard refuses
// anything else — so a site-wide read stays one query.

export const DOOR_STATE_FACTS = ["unlocked", "found"] as const;
export type DoorStateFact = (typeof DOOR_STATE_FACTS)[number];

export const DOOR_STATE_FACT_LABELS: Record<DoorStateFact, string> = {
  unlocked: "Unlocked",
  found: "Found",
};

/** One row of the append-only log. A location fact has `door_id: null`; a
 *  door fact names the door and logs against its site. */
export interface LocationStateEvent {
  id: string;
  user_id: string;
  location_id: string;
  door_id: string | null;
  fact: LocationStateFact | DoorStateFact;
  /** What this event asserts. `false` is how a prior `true` is taken back —
   *  never a row deletion. */
  value: boolean;
  /** "we only got as far as the nave", "the Drowned Bell party had it first". */
  note: string | null;
  created_at: string;
}

export type LocationStateEventInsert =
  | {
      location_id: string;
      fact: LocationStateFact;
      value: boolean;
      note?: string | null;
      door_id?: null;
    }
  | {
      /** The site the door belongs to. */
      location_id: string;
      door_id: string;
      fact: DoorStateFact;
      value: boolean;
      note?: string | null;
    };

/**
 * One row of the `location_state` view — the newest assertion per
 * (location, fact). There is no update path for this shape: a new answer is
 * a new `LocationStateEventInsert`, never a patch to a row of this type.
 */
export interface LocationState {
  location_id: string;
  fact: LocationStateFact | DoorStateFact;
  value: boolean;
  asserted_by: string;
  asserted_note: string | null;
  asserted_at: string;
  /** Null for a location fact; the door for `unlocked` / `found`. */
  door_id: string | null;
}
