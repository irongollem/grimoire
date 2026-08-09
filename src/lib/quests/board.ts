import type { Quest, QuestRef } from "@/types/quest.types";

/**
 * The board can ship before the beat graph does. These optional summaries are the
 * seam #658 will fill with one batched query; legacy quests simply render without
 * beat-only rows instead of receiving placeholder or inferred story data.
 */
export type QuestBeatSegment = "done" | "live" | "gap" | "upcoming";

export interface QuestBoardSummary {
  isLive: boolean;
  currentBeatTitle: string | null;
  beatSegments: QuestBeatSegment[];
  prepGapCount: number;
  undispatchedLootCount: number;
  unclaimedLootCount: number;
}

export interface QuestBoardEntry {
  quest: Quest;
  summary?: QuestBoardSummary;
}

export interface QuestBoardFilters {
  search: string;
  partyOnly: boolean;
  /** Namespaced as `npc:<uuid>` / `location:<uuid>`. */
  entity: string;
  prepGapsOnly: boolean;
  pendingLootOnly: boolean;
}

export interface QuestBoardFilterData {
  refs: QuestRef[];
  summaries?: Record<string, QuestBoardSummary>;
}

/**
 * One filter pipeline for list and board views. Beat-only filters deliberately
 * become no-ops while summaries are unavailable: hiding every legacy quest would
 * be a much worse failure mode than temporarily withholding the filter control.
 */
export function filterQuestBoard(
  quests: Quest[],
  filters: QuestBoardFilters,
  data: QuestBoardFilterData,
): Quest[] {
  const query = filters.search.trim().toLowerCase();
  const [entityType, entityId] = filters.entity.split(":", 2);
  const refsByQuest = new Map<string, QuestRef[]>();
  for (const ref of data.refs) {
    const list = refsByQuest.get(ref.quest_id) ?? [];
    list.push(ref);
    refsByQuest.set(ref.quest_id, list);
  }

  return quests.filter((quest) => {
    if (query && !(
      quest.title.toLowerCase().includes(query) ||
      quest.summary?.toLowerCase().includes(query) ||
      quest.tags.some((tag) => tag.toLowerCase().includes(query))
    )) return false;

    if (filters.partyOnly && !(quest.player_visible_to?.length)) return false;

    if (entityType && entityId) {
      const primaryMatch =
        (entityType === "npc" && quest.giver_npc_id === entityId) ||
        (entityType === "location" && quest.location_id === entityId);
      const refMatch = (refsByQuest.get(quest.id) ?? []).some(
        (ref) => ref.ref_type === entityType && ref.ref_id === entityId,
      );
      if (!primaryMatch && !refMatch) return false;
    }

    const summary = data.summaries?.[quest.id];
    if (filters.prepGapsOnly && data.summaries && !(summary?.prepGapCount)) return false;
    if (filters.pendingLootOnly && data.summaries && !(
      summary?.undispatchedLootCount || summary?.unclaimedLootCount
    )) return false;

    return true;
  });
}
