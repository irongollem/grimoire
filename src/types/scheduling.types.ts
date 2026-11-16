export type SessionStatus = 'proposed' | 'confirmed' | 'cancelled';

export interface SessionProposal {
  id: string;
  campaign_id: string;
  user_id: string;
  proposed_date: string;       // ISO date string YYYY-MM-DD
  proposed_time: string | null; // HH:mm or null
  title: string;
  notes: string | null;
  status: SessionStatus;
  min_attendance: number;
  duration_minutes: number;
  /** The logged session this scheduled evening became (`campaign_sessions.id`); null until it was started. */
  session_id?: string | null;
  /**
   * The regular evening (from the campaign's cadence) this row stands in for:
   * moved to `proposed_date`, or cancelled. Null for an evening added outside
   * the cadence. See `session_cadences` (#1213).
   */
  replaces_date: string | null;
  created_at: string;
  updated_at: string;
}

export type SessionProposalInsert = Omit<SessionProposal, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'replaces_date'> & {
  replaces_date?: string | null;
};
export type SessionProposalUpdate = Partial<Omit<SessionProposalInsert, 'campaign_id'>>;

export interface SessionAvailability {
  id: string;
  session_proposal_id: string;
  campaign_id: string;
  user_id: string;
  available: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionAvailabilityUpsert {
  session_proposal_id: string;
  campaign_id: string;
  available: boolean;
}

/** A campaign's regular rhythm (#1213). One per campaign; evenings are computed from it. */
export interface SessionCadence {
  id: string;
  campaign_id: string;
  user_id: string;
  repeat: "weekly" | "monthly";
  every_weeks: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Monthly only: 1–4, or -1 for the last. */
  week_of_month: number | null;
  /** HH:mm[:ss] wall-clock. */
  start_time: string;
  duration_minutes: number;
  title: string;
  starts_on: string;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
}

export type SessionCadenceInput = Pick<
  SessionCadence,
  "repeat" | "every_weeks" | "weekday" | "week_of_month" | "start_time" | "duration_minutes" | "title" | "starts_on" | "ends_on"
>;

/** "I can't make it" on a regular evening, said by the player unasked. */
export interface SessionAbsence {
  id: string;
  campaign_id: string;
  user_id: string;
  absent_on: string;
  created_at: string;
  updated_at: string;
}
