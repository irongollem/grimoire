/**
 * Wire contract and ranking for campaign-wide semantic search (#599).
 *
 * Pure on purpose: no Deno imports, so the search-campaign edge function and
 * the Vite client both import it (the client through `@edge-shared/*`), and the
 * two can never disagree about the shape of a hit or about what counts as one.
 */

export type CampaignSearchKind =
  | "npc"
  | "location"
  | "faction"
  | "note"
  | "quest"
  | "item"
  | "library_item"
  | "monster"
  | "library_monster";

export interface CampaignSearchHit {
  kind: CampaignSearchKind;
  id: string;
  name: string;
  /** Short secondary line (occupation, status, "Rare weapon", "CR 5"...), or null. */
  descriptor: string | null;
  /** Cosine distance, 0 = identical. Smaller is better. */
  distance: number;
}

/**
 * Why a search came back empty without it being the DM's query that found
 * nothing. Every one of these is an expected degradation, answered with a 200
 * so the client falls back to keyword search without reporting an error.
 * `pro_only`: search by meaning is a Pro feature; every plan keeps keyword
 * search.
 */
export type CampaignSearchUnavailable = "child_account" | "pro_only" | "embedding_provider_unavailable" | "rate_limited";

export interface CampaignSearchResponse {
  hits: CampaignSearchHit[];
  unavailable?: CampaignSearchUnavailable;
}

/**
 * Every note category. match_campaign_notes is fail-closed on `p_categories`
 * (NULL matches nothing: it is the Chronicler's spoiler gate), so a search over
 * the DM's own notes names them all. Held equal to the client's `NoteCategory`
 * by src/types/noteCategories.mirror.test.ts.
 */
export const NOTE_CATEGORIES = ["general", "session", "lore", "location", "quest", "faction"] as const;

// Measured against real text-embedding-3-small vectors (Oct 2026): a short
// query's right answers sit at cosine distance 0.53-0.67, unrelated noise at
// 0.60-0.77. The ranges overlap, so no absolute threshold alone works. A cut at
// `best + 0.08`, capped at 0.72, kept every right answer and dropped every
// unrelated query entirely ("spaceship engine repair" -> nothing). `best` is the
// smallest distance across ALL kinds in one search, so a query that is clearly
// about an NPC does not also drag in a wall of marginal items.
export const RELATIVE_MARGIN = 0.08;
export const ABSOLUTE_CEILING = 0.72;
/** Hits kept per family (an item and a library item share one, as do monsters). */
export const FAMILY_CAP = 5;

type Family = "npc" | "location" | "faction" | "note" | "quest" | "item" | "monster";

function familyOf(kind: CampaignSearchKind): Family {
  if (kind === "library_item") return "item";
  if (kind === "library_monster") return "monster";
  return kind;
}

/** The DM's own row beats the shared library copy of the same name. */
function isOwn(kind: CampaignSearchKind): boolean {
  return kind !== "library_item" && kind !== "library_monster";
}

/**
 * Cut, dedupe, cap and order the merged hits of every kind.
 *
 * 1. Drop anything beyond `min(best + 0.08, 0.72)`.
 * 2. Within the item family and the monster family, keep one hit per
 *    case-insensitive name, the DM's own row winning (the tie-break
 *    itemRetrieval / monsterRetrieval apply); otherwise the nearer wins.
 * 3. Keep the nearest five per family.
 * 4. Return everything sorted by distance, nearest first.
 */
export function rankSearchHits(hits: CampaignSearchHit[]): CampaignSearchHit[] {
  if (hits.length === 0) return [];
  const best = Math.min(...hits.map((h) => h.distance));
  const cut = Math.min(best + RELATIVE_MARGIN, ABSOLUTE_CEILING);
  const kept = hits.filter((h) => h.distance <= cut);

  const deduped = new Map<string, CampaignSearchHit>();
  const unkeyed: CampaignSearchHit[] = [];
  for (const hit of kept) {
    const family = familyOf(hit.kind);
    if (family !== "item" && family !== "monster") {
      unkeyed.push(hit);
      continue;
    }
    const key = `${family}:${hit.name.toLowerCase()}`;
    const current = deduped.get(key);
    if (
      !current ||
      (isOwn(hit.kind) && !isOwn(current.kind)) ||
      (isOwn(hit.kind) === isOwn(current.kind) && hit.distance < current.distance)
    ) {
      deduped.set(key, hit);
    }
  }

  const sorted = [...unkeyed, ...deduped.values()].sort((a, b) => a.distance - b.distance);
  const perFamily = new Map<Family, number>();
  return sorted.filter((hit) => {
    const family = familyOf(hit.kind);
    const n = perFamily.get(family) ?? 0;
    if (n >= FAMILY_CAP) return false;
    perFamily.set(family, n + 1);
    return true;
  });
}
