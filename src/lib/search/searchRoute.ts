/**
 * The kinds a search row can stand for, and the page each opens on. Its own
 * module so the keyword rows (`searchRows`) and the by-meaning hits
 * (`mergeSearchHits`) share one route table without importing each other.
 */
import { placeRoute } from "@/lib/locations/placeRoute";

/** The kinds of thing a search row can stand for. `kind` on a row is one of these. */
export const SEARCH_KINDS = [
  "npc", "party_member", "monster", "note", "spell", "item", "location", "faction", "deity", "quest",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Where a row of one kind opens. */
export function searchRoute(kind: SearchKind, id: string): string {
  switch (kind) {
    case "npc": return `/npcs/${id}`;
    case "party_member": return `/party/${id}`;
    case "monster": return `/monsters/${id}`;
    case "note": return `/notes/${id}`;
    case "spell": return `/spells/${id}`;
    case "item": return `/vault/${id}`;
    case "location": return placeRoute(id);
    case "faction": return `/factions/${id}`;
    case "deity": return `/deities/${id}`;
    case "quest": return `/quests/${id}`;
  }
}
