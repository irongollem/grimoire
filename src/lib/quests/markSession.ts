import { lastPlayedSession } from "@/lib/sessions/sessionPrefill";
import type { CampaignSession } from "@/types/session.types";

/**
 * The session the toolbar files marks under: the DM's own choice when it still
 * names a session in the log, else the open session, else the
 * most recently played one. A stored id for a deleted session falls through to
 * the default rather than filing marks under a row that is gone.
 */
export function resolveMarkSessionId(
  log: readonly CampaignSession[],
  openSessionId: string | null,
  choice: string,
): string | null {
  if (choice && log.some((session) => session.id === choice)) return choice;
  if (openSessionId) return openSessionId;
  return lastPlayedSession(log)?.id ?? null;
}

/** "Session 12", or the session's title when it has no number. */
export function markSessionLabel(session: Pick<CampaignSession, "number" | "title">): string {
  if (session.number !== null) return `Session ${session.number}`;
  return session.title?.trim() || "Untitled session";
}
