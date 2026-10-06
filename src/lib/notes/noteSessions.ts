import { sortSessionLog } from "@/lib/sessions/sessionPrefill";
import type { Note } from "@/types/notes.types";
import type { CampaignSession } from "@/types/session.types";

/** The session a note points at, looked up in a loaded log; null while it loads or when unlinked. */
export function sessionOf<T extends { id: string }>(
  log: readonly T[] | undefined,
  sessionId: string | null,
): T | null {
  if (sessionId === null || log === undefined) return null;
  return log.find((s) => s.id === sessionId) ?? null;
}

/**
 * The session note of the most recent session that is over and has a dated
 * note: "last time", for a new note's start date to follow. Ordered by when the
 * session sits in the log, never by its number, which is only a label.
 */
export function previousSessionNote(notes: readonly Note[], log: readonly CampaignSession[]): Note | null {
  const bySession = new Map<string, Note>();
  for (const n of notes) {
    if (n.category !== "session" || n.session_id === null) continue;
    if (n.session_start_year === null && n.session_end_year === null) continue;
    bySession.set(n.session_id, n);
  }
  for (const s of sortSessionLog(log)) {
    if (s.started_at && !s.ended_at) continue; // still running
    const note = bySession.get(s.id);
    if (note) return note;
  }
  return null;
}

export type SessionPickerState = "no-note" | "has-note" | "running";

export interface SessionPickerOption {
  id: string;
  /** What the closed field shows: "Session 13 · Bells of Daggerford". */
  name: string;
  /** "Sat 27 Sep", or "" when the log row carries no usable date. */
  day: string;
  state: SessionPickerState;
}

/** "Session 13 · Bells of Daggerford" — the picker's own separator, unlike `sessionLabel`'s colon. */
export function pickerName(session: Pick<CampaignSession, "number" | "title">): string {
  const parts = [
    session.number !== null ? `Session ${session.number}` : null,
    session.title?.trim() || null,
  ].filter((p): p is string => p !== null);
  return parts.length ? parts.join(" · ") : "Unnumbered session";
}

/** "Sat 27 Sep", read as a local calendar date for the same reason `formatSessionDay` does. */
export function formatPickerDay(
  row: Pick<CampaignSession, "started_at" | "played_on">,
): string {
  const date = row.started_at
    ? new Date(row.started_at)
    : row.played_on
      ? new Date(`${row.played_on}T12:00:00`)
      : null;
  if (date === null || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

/**
 * The picker's list: sessions without a note first (what the DM most likely
 * means to write up), then the rest, each group newest first. `ownNoteId` is
 * the note being edited, so its own session is not reported as taken.
 */
export function sessionPickerOptions(
  log: readonly CampaignSession[],
  notes: readonly Pick<Note, "id" | "category" | "session_id">[],
  ownNoteId: string | null,
): SessionPickerOption[] {
  const taken = new Set<string>();
  for (const n of notes) {
    if (n.category === "session" && n.session_id !== null && n.id !== ownNoteId) taken.add(n.session_id);
  }
  const options = sortSessionLog(log).map((s): SessionPickerOption => ({
    id: s.id,
    name: pickerName(s),
    day: formatPickerDay(s),
    state: s.started_at && !s.ended_at ? "running" : taken.has(s.id) ? "has-note" : "no-note",
  }));
  return [...options.filter((o) => o.state !== "has-note"), ...options.filter((o) => o.state === "has-note")];
}
