import type { Quest, QuestBeatVisibility, QuestRuntimeChoice, QuestRuntimeJumpTarget } from "@/types/quest.types";

export type QuestJumpGroup = "current" | "side" | "campaign";

export interface RankedQuestJumpTarget extends QuestRuntimeJumpTarget {
  group: QuestJumpGroup;
  recentRank: number;
}

export interface QuestRunBranchChoice extends QuestRuntimeChoice {
  visibility: QuestBeatVisibility;
  presentationHint: string | null;
  prepGapCount: number;
  isVisited: boolean;
}

export function rankQuestJumpTargets(
  targets: QuestRuntimeJumpTarget[],
  quests: Pick<Quest, "id" | "parent_quest_id">[],
  currentQuestId: string | null,
  anchorQuestId: string,
  recentBeatIds: string[],
): RankedQuestJumpTarget[] {
  const questById = new Map(quests.map((quest) => [quest.id, quest]));
  const recent = new Map(recentBeatIds.map((id, index) => [id, index]));
  return targets.map((target) => {
    const quest = questById.get(target.quest_id);
    const group: QuestJumpGroup = target.quest_id === currentQuestId
      ? "current"
      : quest?.parent_quest_id === anchorQuestId || quest?.id === anchorQuestId
        ? "side"
        : "campaign";
    return { ...target, group, recentRank: recent.get(target.beat_id) ?? Number.MAX_SAFE_INTEGER };
  }).sort((a, b) => {
    const groupOrder = { current: 0, side: 1, campaign: 2 };
    return a.recentRank - b.recentRank
      || groupOrder[a.group] - groupOrder[b.group]
      || a.quest_title.localeCompare(b.quest_title)
      || a.beat_title.localeCompare(b.beat_title);
  });
}
