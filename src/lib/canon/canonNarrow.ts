import type { CanonEntry, CanonPart } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

/** The parts an arc narrows. The premise never belongs to an arc, so it is never narrowed. */
const NARROWED: readonly CanonPart[] = ["truth", "force", "secret", "question", "lore", "backstory"];

/** Every entry the page counts, with the narrowed parts cut to the arc and the premise left whole. `null` is no arc. */
export function narrowToArc(entries: readonly CanonEntry[], arcId: string | null): CanonEntry[] {
  if (arcId === null) return [...entries];
  return entries.filter((e) => !NARROWED.includes(e.part) || e.arc_id === arcId);
}

/**
 * The characters whose backstory is in the arc. A character with no backstory entry yet belongs to no arc, so the
 * narrowed list leaves them out.
 */
export function partyInArc(party: readonly PartyMember[], backstories: readonly CanonEntry[], arcId: string | null): PartyMember[] {
  if (arcId === null) return [...party];
  const inArc = new Set(backstories.filter((e) => e.arc_id === arcId && e.party_member_id !== null).map((e) => e.party_member_id));
  return party.filter((m) => inArc.has(m.id));
}

/** A part's search: its words contain the query, any case. An empty query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || text.toLowerCase().includes(needle);
}

/** A part shows its search field once it has more than this many entries (or while a query is set). */
export const SEARCH_THRESHOLD = 5;
