import { isSiteType } from "@/lib/locations/tiers";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { LocationType } from "@/types/location.types";
import type { QuestBeatVisibility, QuestRuntimeChoice, QuestRuntimeJumpTarget } from "@/types/quest.types";

export interface RankedQuestJumpTarget extends QuestRuntimeJumpTarget {
  recentRank: number;
}

export interface QuestRunBranchChoice extends QuestRuntimeChoice {
  visibility: QuestBeatVisibility;
  presentationHint: string | null;
  prepGapCount: number;
  isVisited: boolean;
}

export interface SiteGraphLocation {
  id: string;
  parent_id: string | null;
  location_type: LocationType;
}

/**
 * The site (if any) the party's current position sits inside — walking up
 * ancestors from a room to its dungeon, or returning the position itself when
 * the party stands at the site's own entry rather than in a named room yet.
 *
 * Site position is a fact about the world (epic #780's Atlas), not about any
 * one quest's beat — a party can be mid-dungeon on a chain that never anchors
 * a beat there (that join is Phase 3's job, #797, and does not exist yet).
 * This is why the run cockpit reads `campaigns.current_location_id` directly
 * rather than a beat's `location_set` attachment: walking around a dungeon is
 * not a story event, so it must not depend on one being authored.
 *
 * Cycle-safe the same way `graph.ts` is: `seen` guards the ancestor walk so a
 * malformed `parent_id` chain cannot loop forever.
 */
export function resolveCurrentSite<T extends SiteGraphLocation>(
  partyLocationId: string | null,
  locations: readonly T[],
): T | null {
  if (!partyLocationId) return null;
  const byId = new Map(locations.map((location) => [location.id, location]));
  const start = byId.get(partyLocationId);
  if (!start) return null;
  if (isSiteType(start.location_type)) return start;

  const seen = new Set<string>([start.id]);
  let parent = start.parent_id ? (byId.get(start.parent_id) ?? null) : null;
  while (parent && !seen.has(parent.id)) {
    if (isSiteType(parent.location_type)) return parent;
    seen.add(parent.id);
    parent = parent.parent_id ? (byId.get(parent.parent_id) ?? null) : null;
  }
  return null;
}

/**
 * "The Sunken Vault · dungeon · 5 rooms · 2 explored" — the one-line summary
 * the run cockpit's "where the party is" panel leads with, so a DM reads the
 * site's shape without opening the Atlas.
 */
export function formatSiteSummary(
  site: { name: string; location_type: LocationType },
  roomCount: number,
  exploredCount: number,
): string {
  const typeLabel = LOCATION_TYPE_LABELS[site.location_type].toLowerCase();
  const roomWord = roomCount === 1 ? "room" : "rooms";
  return `${site.name} · ${typeLabel} · ${roomCount} ${roomWord} · ${exploredCount} explored`;
}

/**
 * Alt+→ means "advance when unambiguous," and unambiguous is a fact about the
 * ledger now, not about the graph: a route the gate holds shut does not count
 * as a candidate, so it cannot silently block the shortcut when it sits beside
 * the one route that is actually open, and two open routes must not let the
 * shortcut guess between them (#795).
 */
export function soleOpenOutgoingEdgeId(outgoing: QuestRuntimeChoice[]): string | null {
  const open = outgoing.filter((choice) => !choice.gate || choice.gate.is_open);
  return open.length === 1 ? open[0]!.edge_id : null;
}

/**
 * Jump moves *this* chain's cursor, so every candidate is a beat of the quest in
 * play and recency is the only axis left to rank on.
 *
 * The old current/side/campaign grouping — which sorted a quest's sub-quests
 * above unrelated ones — existed only because the picker spanned the whole
 * campaign. Reaching another quest is now navigation to its own Run surface
 * rather than a cursor write, so nothing here has other quests to sort. If the
 * nesting hint is wanted again it belongs on the quest switcher, where there are
 * actually several quests on offer.
 */
export function rankQuestJumpTargets(
  targets: QuestRuntimeJumpTarget[],
  recentBeatIds: string[],
): RankedQuestJumpTarget[] {
  const recent = new Map(recentBeatIds.map((id, index) => [id, index]));
  return targets
    .map((target) => ({ ...target, recentRank: recent.get(target.beat_id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.recentRank - b.recentRank || a.beat_title.localeCompare(b.beat_title));
}
