import type {
  Quest,
  QuestBeat,
  QuestBeatAttachmentSummary,
  QuestBeatEdge,
  QuestBeatLoot,
  QuestBeatTransition,
  QuestRef,
  QuestRuntimeState,
  QuestRuntimeStatus,
} from "@/types/quest.types";
import { summarizeQuestLootByQuest } from "./loot";
import { deriveQuestBeatPresentations } from "./presentation";

/** Optional summaries keep quests valid while graph data loads: they render without invented
 * beat-only data while flow-enabled quests use one batched campaign query. */
export type QuestBeatSegment = "done" | "here" | "gap" | "upcoming";

export interface QuestBoardSummary {
  /** The party is in this chain right now. Several quests can be live at once —
   * a paused chain still holds its cursor but is not where the table is. */
  isLive: boolean;
  runtimeStatus: QuestRuntimeStatus | null;
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
  /** Namespaced as `npc:<uuid>`, `location:<uuid>`, or `faction:<uuid>`. */
  entity: string;
  prepGapsOnly: boolean;
  pendingLootOnly: boolean;
}

export interface QuestBoardFilterData {
  refs: QuestRef[];
  summaries?: Record<string, QuestBoardSummary>;
}

export interface QuestBoardFilterCounts {
  party: number;
  prepGaps: number;
  pendingLoot: number;
}

export function deriveQuestBoardSummaries(input: {
  beats: QuestBeat[];
  edges: QuestBeatEdge[];
  attachments: QuestBeatAttachmentSummary[];
  loot: QuestBeatLoot[];
  runtime?: QuestRuntimeState[];
  transitions?: QuestBeatTransition[];
}) {
  const lootByQuest = summarizeQuestLootByQuest(input.loot);
  const presentations = deriveQuestBeatPresentations(input);
  const cursorByQuest = new Map<string, QuestRuntimeState>();
  for (const row of input.runtime ?? []) {
    if (row.current_beat_id) cursorByQuest.set(row.quest_id, row);
  }
  const questIds = new Set(input.beats.map((beat) => beat.quest_id));
  for (const row of input.loot) questIds.add(row.quest_id);
  const result: Record<string, QuestBoardSummary> = {};

  for (const questId of questIds) {
    const beats = input.beats.filter((beat) => beat.quest_id === questId);
    const cursor = cursorByQuest.get(questId) ?? null;
    const current = cursor
      ? beats.find((beat) => beat.id === cursor.current_beat_id) ?? null
      : null;
    const loot = lootByQuest[questId] ?? { undispatched: 0, unclaimed: 0 };
    result[questId] = {
      isLive: current !== null && cursor?.status === "running",
      runtimeStatus: cursor?.status ?? null,
      currentBeatTitle: current?.title ?? null,
      beatSegments: beats.map((beat) => {
        const presentation = presentations[beat.id];
        if (presentation?.isCurrent) return "here";
        if (presentation?.isVisited) return "done";
        if (presentation && !presentation.isReady) return "gap";
        return "upcoming";
      }),
      prepGapCount: beats.reduce((total, beat) => total + (presentations[beat.id]?.prepGapCount ?? 0), 0),
      undispatchedLootCount: loot.undispatched,
      unclaimedLootCount: loot.unclaimed,
    };
  }
  return result;
}

/**
 * One filter pipeline for list and board views. Beat-only filters deliberately
 * become no-ops while summaries are unavailable: hiding every quest would
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

/** Facet counts keep every other active filter and turn the counted facet on.
 * This makes each badge answer "how many results would this add/retain now?"
 * without additional queries or per-card work. */
export function countQuestBoardFilters(
  quests: Quest[],
  filters: QuestBoardFilters,
  data: QuestBoardFilterData,
): QuestBoardFilterCounts {
  const countWith = (patch: Partial<QuestBoardFilters>) => filterQuestBoard(
    quests,
    { ...filters, ...patch },
    data,
  ).length;
  return {
    party: countWith({ partyOnly: true }),
    prepGaps: countWith({ prepGapsOnly: true }),
    pendingLoot: countWith({ pendingLootOnly: true }),
  };
}
