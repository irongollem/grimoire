/** What a stored library row says about where it came from. */
export interface StoredIdentity {
  id: string;
  source_document_key?: string | null;
  source_record_key?: string | null;
}

/**
 * Gives each seeded row the id of the stored row with the same
 * (source_document_key, source_record_key), and leaves a row with no stored
 * twin on the id it was minted with. A row's id can come from an older key
 * scheme than the one the seed would mint today (`srd_aboleth_bf`), and
 * upserting the minted one would rewrite the primary key under every character,
 * encounter and inventory that points at it.
 */
export function carryExistingIds<T extends StoredIdentity>(rows: readonly T[], existing: readonly StoredIdentity[]): T[] {
  const idByIdentity = new Map(existing.map((row) => [`${row.source_document_key}::${row.source_record_key}`, row.id]));
  return rows.map((row) => {
    const id = idByIdentity.get(`${row.source_document_key}::${row.source_record_key}`);
    return id === undefined ? row : { ...row, id };
  });
}
