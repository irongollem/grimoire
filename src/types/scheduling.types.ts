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
  created_at: string;
  updated_at: string;
}

export type SessionProposalInsert = Omit<SessionProposal, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
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
