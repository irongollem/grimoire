// Shared pure primitives for campaign serialization (backup + world-bundle).
//
// These are the genuinely-identical building blocks that both
// `useCampaignBackup.ts` (full campaign snapshot) and `useWorldBundle.ts`
// (portable library subset) re-implemented independently. They are pure
// (no Vue, no Supabase, no DOM) so they round-trip-test cleanly.
//
// IMPORTANT — what is deliberately NOT shared:
// The per-entity FK-rewiring flows live in their respective composables. The
// two import paths differ in data-integrity-critical ways (backup preserves
// player_visible_to / map_pins and every FK; the bundle resets visibility and
// nulls out FKs to entities that did not travel in the subset). Merging those
// would obscure two distinct flows. Only the primitives below are shared.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type IdMap = Map<string, string>;

/**
 * Sort rows so parents come before children (topological order over a
 * self-referential `parentField`). Stable for already-ordered input; rows with
 * no parent (or a parent not present in the set) sort first. Any rows left over
 * after the bounded number of passes (circular refs / missing parents — should
 * not happen) are appended as-is rather than dropped.
 */
export function sortByHierarchy(rows: Row[], parentField: string): Row[] {
  const result: Row[] = [];
  const seenIds = new Set<string>();
  const remaining = [...rows];
  let maxPasses = rows.length + 1;

  while (remaining.length > 0 && maxPasses-- > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      const row = remaining[i];
      const parentId = row[parentField] as string | null | undefined;
      if (!parentId || seenIds.has(parentId)) {
        result.push(row);
        seenIds.add(row.id as string);
        remaining.splice(i, 1);
      }
    }
  }
  // Append anything left (circular refs or missing parents — shouldn't happen).
  result.push(...remaining);
  return result;
}

/**
 * Build a Map<oldId → newId> for every row (across all supplied arrays) that
 * carries its own UUID `id` column. Each old id gets a freshly generated UUID.
 * Callers pass their own set of entity arrays — backup and bundle cover
 * different tables, but the assignment logic is identical.
 */
export function buildIdMapFromArrays(arrays: ReadonlyArray<Row[] | undefined>): IdMap {
  const map: IdMap = new Map();
  for (const rows of arrays) {
    if (!rows) continue;
    for (const row of rows) {
      if (row.id) map.set(row.id as string, crypto.randomUUID());
    }
  }
  return map;
}

/**
 * Remap an FK, **preserving the original id when it is not in the map**.
 * Used for references that should survive even if the target did not travel in
 * this export (full backup: every FK travels; bundle: user-library refs the
 * importer may already own). Empty/nullish ids resolve to null.
 *
 * Equivalent to the former `r()` (backup) and `rLib()` (bundle).
 */
export function remapKeep(id: unknown, map: IdMap): string | null {
  if (id === null || id === undefined || id === "") return null;
  return map.get(id as string) ?? (id as string);
}

/**
 * Array variant of {@link remapKeep}. Non-array input → []. Equivalent to the
 * former `rArr()` (backup).
 */
export function remapKeepArr(ids: unknown, map: IdMap): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => remapKeep(id, map) ?? (id as string));
}

/**
 * Remap an FK, returning **null when the id is not in the map**. Used for
 * references to entities scoped to the current export that may not have
 * travelled (bundle subset): a missing target becomes a clean null rather than
 * a dangling FK. Empty/nullish ids resolve to null.
 *
 * Equivalent to the former `rCamp()` (bundle).
 */
export function remapOrNull(id: unknown, map: IdMap): string | null {
  if (id === null || id === undefined || id === "") return null;
  return map.get(id as string) ?? null;
}

/**
 * Resolve an id to its mapped value, or mint a fresh UUID when absent. Used by
 * the bundle import remappers, where a row may carry an id not pre-seeded in
 * the map. Equivalent to the former `freshId()` (bundle).
 */
export function freshId(id: unknown, map: IdMap): string {
  return map.get(id as string) ?? crypto.randomUUID();
}
