/**
 * Whether an entry may be in the Open Book, restated from SQL so the Settings tab can show the same answer the
 * release will give. The database is the authority: these mirror `private.open_book_whole_party` and
 * `private.open_book_takes` (migration 20261023190317) and must change with them.
 */

/** True when `visibleTo` holds every party member and the party is not empty. */
export function wholeParty(
  visibleTo: readonly string[] | null | undefined,
  partyIds: readonly string[],
): boolean {
  if (partyIds.length === 0) return false;
  const seen = new Set(visibleTo ?? []);
  return partyIds.every((id) => seen.has(id));
}

/** An eligible entry is in the book by the DM's choice for it, else by the default (`includeShared`). */
export function isInBook(eligible: boolean, entryChoice: boolean | undefined, includeShared: boolean): boolean {
  return eligible && (entryChoice ?? includeShared);
}
