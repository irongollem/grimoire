import { remapKeep as r, type IdMap } from "./campaignSerialization";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface SessionSource {
  campaign_sessions?: Row[];
  notes: Row[];
}

export interface RestoredSessions {
  /** The log to insert, ids and campaign already pointing at the restored campaign. */
  sessions: Row[];
  /** The notes to insert, `session_id` remapped; none carries `session_num`. */
  notes: Row[];
}

/** The calendar day a legacy numbered note recorded: its real date, else the day it was written. */
function legacyPlayedOn(note: Row): string | null {
  const real = note.session_real_date;
  if (typeof real === "string" && /^\d{4}-\d{2}-\d{2}$/.test(real)) return real;
  return typeof note.created_at === "string" ? note.created_at.slice(0, 10) : null;
}

/**
 * Sessions and session notes for a restore. A restored copy never holds a running
 * session (the log allows one open session per campaign, and a copy is not the
 * game tonight), so an open one is closed at its own start, as the migration that
 * introduced the log closed the ones it carried over.
 *
 * A backup taken before the log existed has no `campaign_sessions` and numbers
 * its session notes with `notes.session_num`. Each such note becomes a session
 * of its own, titled by the note, exactly as that migration did for live data.
 */
export function restoreSessions(
  backup: SessionSource,
  idMap: IdMap,
  newCampaignId: string,
  userId: string,
): RestoredSessions {
  const sessions: Row[] = (backup.campaign_sessions ?? []).map((s) => ({
    ...s,
    id: r(s.id, idMap),
    campaign_id: newCampaignId,
    user_id: userId,
    ended_at: s.ended_at ?? s.started_at ?? null,
  }));

  const notes = backup.notes.map(({ session_num: legacyNumber, ...note }) => {
    if (note.session_id) return { ...note, session_id: r(note.session_id, idMap) };
    if (note.category === "session" && typeof legacyNumber === "number") {
      const title = typeof note.title === "string" ? note.title.trim() : "";
      const id = crypto.randomUUID();
      sessions.push({
        id,
        campaign_id: newCampaignId,
        user_id: userId,
        number: legacyNumber,
        title: title || null,
        played_on: legacyPlayedOn(note),
      });
      return { ...note, session_id: id };
    }
    return { ...note, session_id: null };
  });

  return { sessions, notes };
}
