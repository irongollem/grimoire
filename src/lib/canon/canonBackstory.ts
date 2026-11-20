import type { CampaignSession } from "@/types/session.types";
import type { CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

/**
 * Backstories written together (#1226 story 10, frame 14). Pure helpers: whose words a passage is, and when in the
 * campaign it was written.
 */

/**
 * When in the campaign a passage was written: "before play" until a session had started, then "after session N" for the
 * latest session that had started before it. A session never run in the app (no start time) cannot be placed, so it is
 * skipped; an unnumbered one is "after a session".
 */
export function writtenWhen(writtenAt: string, sessions: readonly Pick<CampaignSession, "number" | "started_at">[]): string {
  const at = new Date(writtenAt).getTime();
  let latest: Pick<CampaignSession, "number" | "started_at"> | null = null;
  for (const session of sessions) {
    if (session.started_at === null) continue;
    const started = new Date(session.started_at).getTime();
    if (started > at) continue;
    if (latest === null || latest.started_at === null || started > new Date(latest.started_at).getTime()) latest = session;
  }
  if (latest === null) return "before play";
  return latest.number === null ? "after a session" : `after session ${latest.number}`;
}

/** True when the character's player wrote it (the DM writes every other passage of a backstory). */
export function isPlayersPassage(passage: Pick<CanonLorePassage, "author_id">, member: Pick<PartyMember, "owner_user_id">): boolean {
  return passage.author_id !== null && member.owner_user_id !== null && passage.author_id === member.owner_user_id;
}

/** The line under a passage's heading on the DM's page: "Written by Lotte · before play", or "Your passage". */
export function passageByline(
  passage: Pick<CanonLorePassage, "author_id" | "created_at">,
  member: Pick<PartyMember, "owner_user_id" | "player_name">,
  sessions: readonly Pick<CampaignSession, "number" | "started_at">[],
): string {
  if (!isPlayersPassage(passage, member)) return "Your passage";
  return `Written by ${member.player_name ?? "the player"} · ${writtenWhen(passage.created_at, sessions)}`;
}

/** Passages in the order the story grew: when each was written, the order they were told breaking a tie. */
export function inWrittenOrder<T extends { written_at: string; sort_order: number }>(passages: readonly T[]): T[] {
  return [...passages].sort((a, b) => a.written_at.localeCompare(b.written_at) || a.sort_order - b.sort_order);
}

/**
 * Who a player's new passage is told to: their own character always, and the whole party when they chose to share it
 * (a backstory is party-visible on the sheet today, so sharing is the default). Never a duplicate.
 */
export function sharedWith(ownMemberId: string, partyIds: readonly string[], shareWithParty: boolean): string[] {
  return [...new Set([ownMemberId, ...(shareWithParty ? partyIds : [])])];
}
