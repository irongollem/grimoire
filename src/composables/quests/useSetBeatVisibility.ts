import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { useShareQuest } from "@/composables/quests/useShareQuest";
import type { QuestBeat, QuestBeatVisibility } from "@/types/quest.types";

/**
 * The one write of a beat's player visibility on the opened beat (#1183): the
 * identity editor and the "Players see" reveal both come here. Showing the table
 * a beat of a quest it cannot see would leave the beat nowhere, so a write that
 * succeeds is followed by `shareIfBeatSeen`; one that fails shares nothing.
 */
export function useSetBeatVisibility() {
  const updateBeat = useUpdateQuestBeat();
  const { shareIfBeatSeen } = useShareQuest();
  return async function setBeatVisibility(beat: Pick<QuestBeat, "id" | "quest_id" | "updated_at">, visibility: QuestBeatVisibility) {
    await updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, expectedUpdatedAt: beat.updated_at, update: { visibility } });
    await shareIfBeatSeen(beat.quest_id, visibility);
  };
}
