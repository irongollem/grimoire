import { endedByPause } from "./sittingLength";

/** A sitting as the start page knows it. */
export interface ResumableSitting {
  id: string;
  party_member_id: string | null;
  scene_location_id: string | null;
  left_at: string | null;
  /** When the table last moved in it; the pause since then can have ended it. */
  updated_at: string;
}

/**
 * How the table is picked up again.
 * - `open`: the last sitting was never left, so it is simply reopened, as it stands.
 * - `again`: the last sitting was left; a new one begins as the same character where the party was.
 * - `first`: nothing to pick up, so the player chooses who to play.
 */
export type Resume =
  | { kind: "open"; sessionId: string; characterId: string }
  | { kind: "again"; characterId: string; placeId: string | null }
  | { kind: "first" };

/**
 * Where the story goes on (maintainer, 17 Nov 2026: "don't you just continue wherever you last left the story?").
 * The newest sitting whose character is still in the party decides: the table does not ask again who is played or
 * where, because the campaign already knows both. `sittings` is newest first. A sitting whose character is gone is
 * passed over, since it could not be played on.
 */
export function resumeOf(sittings: readonly ResumableSitting[], partyIds: ReadonlySet<string>, nowMs: number): Resume {
  const last = sittings.find((s) => s.party_member_id !== null && partyIds.has(s.party_member_id));
  if (!last || last.party_member_id === null) return { kind: "first" };
  // A sitting the pause has ended is over, whether or not its leave was recorded: the server refuses its turns, and
  // reopening it only sent the page to end it again, back here and round once more when that leave failed too.
  const ended = last.left_at !== null || endedByPause(Date.parse(last.updated_at), nowMs);
  if (!ended) return { kind: "open", sessionId: last.id, characterId: last.party_member_id };
  return { kind: "again", characterId: last.party_member_id, placeId: last.scene_location_id };
}
