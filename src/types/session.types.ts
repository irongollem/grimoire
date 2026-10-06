/**
 * The campaign session — the stretch of real time in which a DM is running the
 * game for players who are present.
 *
 * Not to be confused with `session_proposals` (scheduling: which evening the
 * table has agreed on) or with `userMode` (the DM/Player lens). This is the
 * live one: started, running, ended. See `docs/session-mode.md`.
 */
export interface CampaignSession {
  id: string;
  campaign_id: string;
  /** Whoever started or logged it. Any DM of the campaign may end it, since
   *  the policy is campaign-scoped: this is a record, not an ownership claim. */
  user_id: string;
  /** The DM's own numbering. Null for an unnumbered session (a test, a one-shot). */
  number: number | null;
  title: string | null;
  /** The calendar day a session logged after the fact was played. */
  played_on: string | null;
  /** Null for a past session logged by hand, which was never run in the app. */
  started_at: string | null;
  /** Null while it is running. */
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What a player may know of the running session, from `get_player_session_state`. */
export interface PlayerSessionState {
  is_running: boolean;
  started_at: string | null;
  session_id: string | null;
  number: number | null;
  title: string | null;
}

/** A session as players label it, from `get_player_sessions`. */
export interface PlayerSessionLabel {
  id: string;
  number: number | null;
  title: string | null;
  played_on: string | null;
  started_at: string | null;
  ended_at: string | null;
}

/** What `end_campaign_session` closed on the way out, for the confirmation copy. */
export interface CampaignSessionEnded {
  encounters_ended: number;
  chains_paused: number;
}
