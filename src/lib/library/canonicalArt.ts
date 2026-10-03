/**
 * Planning for an app admin's art edit on a shared library entry. An admin edits
 * the canonical version, not a personal override, and the picture they edit is
 * often shared: one image backs several library ids (a monster family, a spell
 * and its same-named namesake, whose `library_*.image_url` holds the shared
 * picture). Editing one id must therefore edit every id showing that picture,
 * or the edit would appear on one card and not its twins.
 *
 * Pure so monsters and spells share it; the caller does the reads and writes.
 */

export interface CanonicalArtPlanInput<Field extends string> {
  entryId: string;
  /** The edit as sent by the caller. A field that is undefined is untouched; null is a real value (clear it). */
  edit: Partial<Record<Field, unknown>>;
  /** The edited row's picture before this edit. Null means nothing is shared. */
  currentImageUrl: string | null;
  libraryRows: readonly { id: string; image_url: string | null }[];
  canonicalRows: readonly { entry_id: string; image_url: string | null }[];
}

export interface CanonicalArtPlan<Field extends string> {
  /** The edited id first, then every other id showing the same picture; no duplicates. */
  ids: string[];
  /** The edit's own fields, so a write never touches (nulls) a field the edit left out. */
  fields: Field[];
}

export function planCanonicalArtWrite<Field extends string>(
  input: CanonicalArtPlanInput<Field>,
): CanonicalArtPlan<Field> {
  const { entryId, edit, currentImageUrl, libraryRows, canonicalRows } = input;
  const ids = new Set<string>([entryId]);
  if (currentImageUrl !== null) {
    for (const row of libraryRows) {
      if (row.image_url === currentImageUrl) ids.add(row.id);
    }
    for (const row of canonicalRows) {
      if (row.image_url === currentImageUrl) ids.add(row.entry_id);
    }
  }
  const fields = (Object.keys(edit) as Field[]).filter((field) => edit[field] !== undefined);
  return { ids: [...ids], fields };
}
