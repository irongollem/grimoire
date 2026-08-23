/**
 * The campaign session — the stretch of real time in which a DM is running the
 * game for players who are present.
 *
 * Not to be confused with `session_proposals` (scheduling: which evening the
 * table has agreed on) or with `userMode` (the DM/Player lens). This is the
 * live one: started, running, ended. See `docs/session-mode.md`.
 */
export interface CampaignSessionState {
  id: string;
  campaign_id: string;
  /** Whoever started it. Any DM of the campaign may end it — the policy is
   *  campaign-scoped, so this is a record, not an ownership claim. */
  user_id: string;
  is_running: boolean;
  /** Kept across the end, so a finished session still describes a span. */
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What `end_campaign_session` closed on the way out, for the confirmation copy. */
export interface CampaignSessionEnded {
  encounters_ended: number;
  chains_paused: number;
}
