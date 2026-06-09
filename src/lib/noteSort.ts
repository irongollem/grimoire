/**
 * Shared sort logic for DM notes and player journal entries.
 *
 * Both `Note` and `PlayerJournalEntry` expose the same orderable fields, so a
 * single comparator serves both surfaces. Pinning (notes only) is layered on
 * top by the calling component — this comparator is pin-agnostic.
 */

export const SORT_FIELDS = ["created", "updated", "title", "manual"] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortDir = "asc" | "desc";

export interface SortableEntity {
  created_at: string;
  updated_at: string;
  title: string | null;
  sort_order: number | null;
}

/**
 * Compare two entities by the chosen field/direction.
 *
 * - `manual` orders by `sort_order` ascending with nulls last, tie-breaking on
 *   `created_at` (newest first) so freshly-created, never-reordered items stay
 *   together at the bottom in a stable order. Direction is ignored for manual —
 *   the user's drag order is absolute.
 * - `title` uses locale-aware comparison; null/empty titles sort last in `asc`.
 * - `created` / `updated` compare timestamps.
 */
export function compareEntities(
  a: SortableEntity,
  b: SortableEntity,
  field: SortField,
  dir: SortDir,
): number {
  if (field === "manual") return compareManual(a, b);

  const mult = dir === "asc" ? 1 : -1;

  if (field === "title") {
    const at = (a.title ?? "").trim();
    const bt = (b.title ?? "").trim();
    // Empty titles always sink to the bottom regardless of direction.
    if (!at && !bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return at.localeCompare(bt) * mult;
  }

  const key = field === "created" ? "created_at" : "updated_at";
  return (new Date(a[key]).getTime() - new Date(b[key]).getTime()) * mult;
}

function compareManual(a: SortableEntity, b: SortableEntity): number {
  const ao = a.sort_order;
  const bo = b.sort_order;
  if (ao !== null && bo !== null) {
    if (ao !== bo) return ao - bo;
  } else if (ao !== null) {
    return -1;
  } else if (bo !== null) {
    return 1;
  }
  // Both null (or equal sort_order): newest created first.
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/** Stable sort helper returning a new array (does not mutate input). */
export function sortEntities<T extends SortableEntity>(
  list: readonly T[],
  field: SortField,
  dir: SortDir,
): T[] {
  return [...list].sort((a, b) => compareEntities(a, b, field, dir));
}
