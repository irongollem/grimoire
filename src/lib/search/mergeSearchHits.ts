import type { CampaignSearchHit, CampaignSearchKind } from "@edge-shared/campaignSearch.ts";
import { placeRoute } from "@/lib/locations/placeRoute";

/** One row in the search dropdown. Keyword hits have no descriptor; semantic
 *  hits carry the server's one-line reason they matched. */
export interface SearchHit {
  id: string;
  name: string;
  route: string;
  descriptor?: string | null;
  matchedBy: "name" | "meaning";
}

export interface SearchGroup {
  type: string;
  label: string;
  items: SearchHit[];
}

/** Most rows one group shows once the two tiers are merged. */
export const GROUP_CAP = 6;

/** The fixed group order the keyword tier has always used. */
export const GROUP_ORDER = ["npc", "monster", "note", "spell", "item", "location", "faction", "quest"] as const;
export type SearchGroupType = (typeof GROUP_ORDER)[number];

export const GROUP_LABEL: Record<SearchGroupType, string> = {
  npc: "NPCs",
  monster: "Bestiary",
  note: "Notes",
  spell: "Spells",
  item: "Vault",
  location: "Locations",
  faction: "Factions",
  quest: "Quests",
};

const KIND_GROUP: Record<CampaignSearchKind, SearchGroupType> = {
  npc: "npc",
  location: "location",
  faction: "faction",
  note: "note",
  quest: "quest",
  item: "item",
  library_item: "item",
  monster: "monster",
  library_monster: "monster",
};

/** Library items open in the vault detail too: `ItemDetailView` resolves a
 *  text slug against `library_items` and a uuid against `items`. */
function hitRoute(kind: CampaignSearchKind, id: string): string {
  switch (kind) {
    case "npc": return `/npcs/${id}`;
    case "location": return placeRoute(id);
    case "faction": return `/factions/${id}`;
    case "note": return `/notes/${id}`;
    case "quest": return `/quests/${id}`;
    case "item":
    case "library_item": return `/vault/${id}`;
    case "monster":
    case "library_monster": return `/monsters/${id}`;
  }
}

/**
 * Folds the by-meaning hits into the keyword groups.
 *
 * Within a group keyword hits stay first, in their order, then semantic hits
 * whose id is not already there, nearest first, up to {@link GROUP_CAP}. Groups
 * with a keyword hit keep the fixed order and come first; groups that only
 * meaning found follow, nearest best hit first, so "the pig tavern" surfaces
 * Locations on top when no name contains it. With no semantic hits the keyword
 * groups come back unchanged.
 */
export function mergeSearchGroups(keyword: SearchGroup[], semantic: readonly CampaignSearchHit[]): SearchGroup[] {
  if (semantic.length === 0) return keyword;

  const byType = new Map<string, SearchGroup>(keyword.map((g) => [g.type, { ...g, items: [...g.items] }]));
  const keywordTypes = new Set(keyword.map((g) => g.type));
  const best = new Map<SearchGroupType, number>();

  for (const hit of [...semantic].sort((a, b) => a.distance - b.distance)) {
    const type = KIND_GROUP[hit.kind];
    let group = byType.get(type);
    if (!group) {
      group = { type, label: GROUP_LABEL[type], items: [] };
      byType.set(type, group);
    }
    if (group.items.length >= GROUP_CAP || group.items.some((i) => i.id === hit.id)) continue;
    group.items.push({
      id: hit.id,
      name: hit.name,
      route: hitRoute(hit.kind, hit.id),
      descriptor: hit.descriptor,
      matchedBy: "meaning",
    });
    if (!best.has(type)) best.set(type, hit.distance);
  }

  const rank = (type: string) => GROUP_ORDER.indexOf(type as SearchGroupType);
  const withKeyword = GROUP_ORDER.filter((t) => keywordTypes.has(t)).map((t) => byType.get(t));
  const semanticOnly = GROUP_ORDER.filter((t) => !keywordTypes.has(t) && best.has(t))
    .sort((a, b) => best.get(a)! - best.get(b)! || rank(a) - rank(b))
    .map((t) => byType.get(t));
  return [...withKeyword, ...semanticOnly].filter((g): g is SearchGroup => g !== undefined && g.items.length > 0);
}
