/**
 * A character handed to another member for a session (#1059,
 * `public.character_caretakers`). The caretaker's seat points at the character
 * while they play it; the owner's seat never moves. Active while not revoked
 * and its session, if it has one yet, has not ended: see `lib/player/caretaking`.
 */
export interface CharacterCaretaker {
  id: string;
  campaign_id: string;
  party_member_id: string;
  caretaker_user_id: string;
  /** The owner or a DM of the table. Null once that account is gone. */
  granted_by: string | null;
  /** The session it is for; null until the next session starts. */
  session_id: string | null;
  /** The caretaker's own character, where their seat goes back to. */
  return_member_id: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What a client sends: who, for whom, at which table. The server fills the rest. */
export interface CharacterCaretakerInsert {
  campaign_id: string;
  party_member_id: string;
  caretaker_user_id: string;
}
