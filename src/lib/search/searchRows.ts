/**
 * Pure pieces of the global search (#1084 widened it to people, deities and
 * ties): the kinds a row can stand for, where each opens, the shape of the
 * rows its reads return, and how the by-meaning hits fold in around the
 * keyword groups. The reads themselves stay in `useGlobalSearch`.
 */
import type { CampaignSearchHit } from "@edge-shared/campaignSearch.ts";
import { placeRoute } from "@/lib/locations/placeRoute";
import { GROUP_ORDER, mergeSearchGroups, type SearchGroup, type SearchHit } from "@/lib/search/mergeSearchHits";

/** The kinds of thing a search row can stand for. `kind` on a row is one of these. */
export const SEARCH_KINDS = [
  "npc", "party_member", "monster", "note", "spell", "item", "location", "faction", "deity", "quest",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** The id of the group "who worships X" answers go in; it is not a kind. */
export const TIES_GROUP = "ties";

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

export type NpcSearchRow = {
  id: string; name: string; disguise_name: string | null; occupation: string | null;
  // `npcs` and `locations` reference each other twice, so the embed names its FK.
  location: { name: string } | null;
};
export type PartySearchRow = { id: string; name: string; class: string | null; level: number | null };
export type DeitySearchRow = { id: string; name: string; titles: string | null; domains: string[] | null };

function joinDetail(parts: (string | null | undefined)[]): string | null {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => p !== undefined && p !== "");
  return kept.length > 0 ? kept.join(" · ") : null;
}

/** An NPC's line: what they do, and where. */
export function npcDetail(row: Pick<NpcSearchRow, "occupation" | "location">): string | null {
  return joinDetail([row.occupation, row.location?.name]);
}

/** Groups the semantic merge does not know: it would drop them, so they are set aside and put back. */
const MERGE_KNOWN: ReadonlySet<string> = new Set(GROUP_ORDER);

function insertRelative(groups: SearchGroup[], extra: SearchGroup, after: string | null, before: string | null): void {
  const afterAt = after === null ? -1 : groups.findIndex((g) => g.type === after);
  const beforeAt = before === null ? -1 : groups.findIndex((g) => g.type === before);
  if (afterAt >= 0) groups.splice(afterAt + 1, 0, extra);
  else if (beforeAt >= 0) groups.splice(beforeAt, 0, extra);
  else groups.push(extra);
}

/**
 * Folds the by-meaning hits into the keyword groups. Ties lead; people of the
 * party follow NPCs; deities sit ahead of quests. `mergeSearchGroups` only knows
 * the original eight kinds, so the newer groups ride around it.
 */
export function mergeAllGroups(keyword: SearchGroup[], semantic: readonly CampaignSearchHit[]): SearchGroup[] {
  const ties = keyword.find((g) => g.type === TIES_GROUP);
  const party = keyword.find((g) => g.type === "party_member");
  const deities = keyword.find((g) => g.type === "deity");
  const merged = mergeSearchGroups(keyword.filter((g) => MERGE_KNOWN.has(g.type)), semantic);
  if (party) insertRelative(merged, party, "npc", null);
  if (deities) insertRelative(merged, deities, null, "quest");
  return ties ? [ties, ...merged] : merged;
}


/** An NPC row as a hit; a disguised NPC is found by either name. */
export function npcHit(r: NpcSearchRow): SearchHit {
  return {
    id: r.id,
    name: r.disguise_name ? `${r.name} (${r.disguise_name})` : r.name,
    route: searchRoute("npc", r.id),
    detail: npcDetail(r),
    matchedBy: "name",
  };
}

export function partyHit(r: PartySearchRow): SearchHit {
  return {
    id: r.id,
    name: r.name,
    route: searchRoute("party_member", r.id),
    detail: joinDetail([r.class, r.level === null ? null : `level ${r.level}`]),
    matchedBy: "name",
  };
}

export function deityHit(r: DeitySearchRow): SearchHit {
  return {
    id: r.id,
    name: r.name,
    route: searchRoute("deity", r.id),
    detail: joinDetail([r.titles, r.domains && r.domains.length > 0 ? r.domains.join(", ") : null]),
    matchedBy: "name",
  };
}
