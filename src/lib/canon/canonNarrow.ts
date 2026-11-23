import type { CanonEntry, CanonPart } from "@/types/canon.types";

/**
 * The parts an arc narrows. The premise never belongs to an arc, so it is never narrowed, and a backstory is not either:
 * a character spans arcs, so the Backstories part always lists the whole party (#1258 item 29).
 */
const NARROWED: readonly CanonPart[] = ["truth", "force", "secret", "question", "lore"];

/** Every entry the page counts, with the narrowed parts cut to the arc and the premise left whole. `null` is no arc. */
export function narrowToArc(entries: readonly CanonEntry[], arcId: string | null): CanonEntry[] {
  if (arcId === null) return [...entries];
  return entries.filter((e) => !NARROWED.includes(e.part) || e.arc_id === arcId);
}

/** A part's search: its words contain the query, any case. An empty query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || text.toLowerCase().includes(needle);
}

/** A part shows its search field once it has more than this many entries (or while a query is set). */
export const SEARCH_THRESHOLD = 5;
