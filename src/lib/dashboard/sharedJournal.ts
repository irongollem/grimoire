import type { PlayerJournalEntry } from "@/composables/notes/usePlayerJournal";

/**
 * Player journal entries the DM has not read yet (#764).
 *
 * The catalogue expected this widget to need a schema change — "no 'DM has
 * seen' marker exists; needs the inverse of `player_read_items`". Reading that
 * table says otherwise: it is keyed `(user_id, campaign_id, entity_type,
 * entity_id)` and its four RLS policies are plain `auth.uid() = user_id`.
 * Nothing in it is player-specific except its name. The DM is an authenticated
 * user who owns the campaign, so a DM row is an ordinary row, and the marker
 * this widget needs already exists under `entity_type: "journal_entry"`.
 *
 * The name is now slightly wrong — it is a per-*user* read marker, not a
 * per-player one — and that is not worth a migration to fix. It is written
 * down here instead, which is the cheaper half of the same job.
 */

/** Only the fields this module reads, so the widget's tests need no full row. */
export interface SharedJournalInput {
  id: string;
  title: string | null;
  content: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SharedJournalRow {
  id: string;
  /** The author's display name, or a marker when the writer has left. */
  authorName: string;
  title: string;
  updatedAt: string;
}

const UNTITLED = "Untitled entry";

/**
 * A player who has left the campaign still has entries in it. Naming the gap
 * beats an empty byline, and matches the `"??? (removed)"` marker the downtime
 * board already uses for a deleted character.
 */
const UNKNOWN_AUTHOR = "??? (removed)";

/**
 * The unread entries, newest first.
 *
 * `isUnread` is injected rather than imported so this stays testable without
 * mounting `useReadItems` — and so the widget's definition of "unread" and
 * this module's ordering cannot drift apart into two rules.
 */
export function buildSharedJournalRows(
  entries: readonly SharedJournalInput[],
  authorNames: ReadonlyMap<string, string>,
  isUnread: (entry: SharedJournalInput) => boolean,
  limit: number,
): SharedJournalRow[] {
  return entries
    .filter(isUnread)
    .slice()
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      authorName: authorNames.get(entry.user_id) ?? UNKNOWN_AUTHOR,
      // A journal entry's title is optional; the list it comes from calls an
      // untitled one exactly this, and two surfaces should not disagree.
      title: entry.title === null || entry.title.trim() === "" ? UNTITLED : entry.title,
      updatedAt: entry.updated_at,
    }));
}

/** Narrowing helper so the widget can hand this module its real rows. */
export function toSharedJournalInput(entry: PlayerJournalEntry): SharedJournalInput {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    user_id: entry.user_id,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
}
