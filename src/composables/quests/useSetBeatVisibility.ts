import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import type { QuestBeat, QuestBeatVisibility } from "@/types/quest.types";

/**
 * The one write of a beat's player visibility on the opened beat (#1183): the
 * identity editor and the "Players see" reveal both come here. A quest is
 * visible to players when one of its beats is, and the server announces the
 * first beat to show ("Quest shared"), so this only writes the beat.
 */
export function useSetBeatVisibility() {
  const updateBeat = useUpdateQuestBeat();
  return async function setBeatVisibility(beat: Pick<QuestBeat, "id" | "quest_id" | "updated_at">, visibility: QuestBeatVisibility) {
    await updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, expectedUpdatedAt: beat.updated_at, update: { visibility } });
  };
}
