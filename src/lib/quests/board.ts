import type { Quest } from "@/types/quest.types";

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
