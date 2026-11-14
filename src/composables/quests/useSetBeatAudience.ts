import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import type { QuestBeat } from "@/types/quest.types";

/**
 * The one write of a beat's audience (#1194): null for the whole party, else
 * the party member ids who see it. An empty list is never written; it would
 * show the beat to no one, which is what Hidden is for.
 */
export function useSetBeatAudience() {
  const updateBeat = useUpdateQuestBeat();
  return async function setBeatAudience(beat: Pick<QuestBeat, "id" | "quest_id" | "updated_at">, visibleTo: string[] | null) {
    if (visibleTo !== null && visibleTo.length === 0) throw new Error("A beat needs at least one person to show it to.");
    await updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, expectedUpdatedAt: beat.updated_at, update: { visible_to: visibleTo } });
  };
}
