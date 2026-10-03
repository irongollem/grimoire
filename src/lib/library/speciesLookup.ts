import { isUuid } from "@/lib/library/contentIdentity";

/**
 * `party_members.species_id` is text and holds either a custom species uuid or a
 * shared `library_species` slug (migration 20260724000003). A lookup by id must
 * send each id to the table it lives in: a uuid-shaped filter against the text
 * table, or a slug against the uuid column, is an error rather than an empty hit.
 */
export function splitSpeciesIds(ids: readonly (string | null | undefined)[]): {
  libraryIds: string[];
  customIds: string[];
} {
  const unique = [...new Set(ids.filter((id): id is string => !!id))].sort();
  return {
    libraryIds: unique.filter((id) => !isUuid(id)),
    customIds: unique.filter((id) => isUuid(id)),
  };
}

/** Rows keyed by id. Ids are unique across both tables (slug vs uuid), so no row shadows another. */
export function indexById<T extends { id: string }>(...lists: readonly (readonly T[])[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const list of lists) for (const row of list) map.set(row.id, row);
  return map;
}
