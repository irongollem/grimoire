import type { PlayerJournalEntry } from "@/composables/notes/usePlayerJournal";

/**
 * The Hearth's quick note is ONE journal entry per sitting. These are the two
 * rules that keep it that way: what the entry is called, and which existing
 * entry a returning player (a remount, another device, a page reload mid-game)
 * should keep typing into instead of starting a second.
 */

export const SESSION_NOTE_CATEGORY = "session";
const TITLE_PREFIX = "Session notes";

/** "Session notes · 5 Oct 2026", the local date the sitting began on. */
export function sessionNoteTitle(now: Date): string {
  const date = now.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `${TITLE_PREFIX} · ${date}`;
}

type NoteCandidate = Pick<PlayerJournalEntry, "category" | "title" | "created_at">;

/**
 * The newest entry made since the session started that the Hearth itself made:
 * a Session Log entry whose title carries the Hearth's prefix. A note the
 * player wrote by hand in the Journal during the session is not picked up.
 */
export function findSessionNote<T extends NoteCandidate>(
  entries: readonly T[] | undefined,
  startedAt: string | null,
): T | null {
  if (!entries || !startedAt) return null;
  const since = Date.parse(startedAt);
  if (Number.isNaN(since)) return null;
  const matches = entries
    .filter(
      (e) =>
        e.category === SESSION_NOTE_CATEGORY &&
        e.title?.startsWith(TITLE_PREFIX) === true &&
        Date.parse(e.created_at) >= since,
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return matches[0] ?? null;
}

/**
 * Whether the pad may open for typing. Before the journal has loaded, a typed
 * note has no existing entry to continue and would create a second one; with no
 * session start, `findSessionNote` can never find the entry again, so every
 * remount would create another.
 */
export function canEditSessionNote(journalLoaded: boolean, startedAt: string | null): boolean {
  return journalLoaded && startedAt !== null;
}
