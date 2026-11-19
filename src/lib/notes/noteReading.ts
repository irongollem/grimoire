// Whether a note has been read aloud, as the page shows it (#1021 row 19). Pure: no I/O.

export interface ReadableNote {
  reading_hash?: string | null;
  reading_at?: string | null;
  updated_at: string;
}

/**
 * `none`: never read aloud. `current`: the reading is of the note as it stands. `earlier`: the note was changed
 * after it was read, so what is heard is an earlier version. Both times are the database's, and saying a note has
 * a reading does not move `updated_at` (only a change to what the note says does), so "changed since" is exactly
 * `updated_at > reading_at`.
 */
export function readingState(note: ReadableNote): "none" | "current" | "earlier" {
  if (!note.reading_hash || !note.reading_at) return "none";
  const read = Date.parse(note.reading_at);
  const changed = Date.parse(note.updated_at);
  if (Number.isNaN(read) || Number.isNaN(changed)) return "current";
  return changed > read ? "earlier" : "current";
}
