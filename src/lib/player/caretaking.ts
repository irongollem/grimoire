/**
 * Look after my character (#1059): which hand-overs are in force.
 *
 * The database derives this the same way (`private.minds_character`): a
 * hand-over is active while it is not revoked and its session has not ended.
 * One granted between sessions has no session yet and is active until the next
 * one ends; starting or continuing a session files it under that session. A
 * client cannot read `campaign_sessions` as a player, so the open session comes
 * from `get_player_session_state` (`usePlayerSessionState`), which any member,
 * DM included, may call.
 */
import type { CharacterCaretaker } from "@/types/caretaker.types";

/** Whether a hand-over is in force, given the campaign's open session (null when none is open). */
export function isHandOverActive(row: CharacterCaretaker, openSessionId: string | null): boolean {
  if (row.revoked_at !== null) return false;
  return row.session_id === null || row.session_id === openSessionId;
}

/** The hand-overs in force, one per character at most (the database allows no more). */
export function activeHandOvers(rows: readonly CharacterCaretaker[], openSessionId: string | null): CharacterCaretaker[] {
  return rows.filter(row => isHandOverActive(row, openSessionId));
}

/** The active hand-over of a character, if someone is minding it. */
export function handOverOf(
  rows: readonly CharacterCaretaker[],
  partyMemberId: string,
  openSessionId: string | null,
): CharacterCaretaker | null {
  return rows.find(row => row.party_member_id === partyMemberId && isHandOverActive(row, openSessionId)) ?? null;
}

/** The characters a user is minding now. */
export function mindedBy(
  rows: readonly CharacterCaretaker[],
  userId: string,
  openSessionId: string | null,
): CharacterCaretaker[] {
  return rows.filter(row => row.caretaker_user_id === userId && isHandOverActive(row, openSessionId));
}

/**
 * The speaker a line is attributed to while someone plays a character for its
 * owner: "Tomas, for Mira". The caretaker's name comes first because they are
 * the one talking; the character is who they are talking for.
 */
export function speakingFor(caretakerName: string, characterName: string): string {
  return `${caretakerName}, for ${characterName}`;
}
