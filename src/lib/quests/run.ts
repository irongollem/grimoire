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
