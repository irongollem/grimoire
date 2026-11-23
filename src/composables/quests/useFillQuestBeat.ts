/**
 * "Fill a beat with AI and save it": the generate-then-apply step the beat editor does through its draft, as one call
 * for Ask Grimoire (#1253). The apply rule is the editor's (`applyFilledBeat`), run on the beat's saved row instead of
 * the live draft, and the save is the editor's too (`useUpdateQuestBeat`, with the row's `updated_at` as the lock, so a
 * beat the DM edited meanwhile is not overwritten).
 *
 * Deliberately narrow, as `useGenerateMonster` is: the editor keeps its confirm-before-replace, its paywall and the
 * draft in front of the DM; this is only the step they share. A failed generation returns null (its message is
 * `error`); a failed save throws.
 */
import { useQuestBeatFill } from "@/ai/useQuestBeatFill";
import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { applyFilledBeat, questBeatDraftToUpdate, questBeatToDraft } from "@/lib/quests/beatDraft";
import type { BeatFillContext } from "@/lib/quests/beatFill";
import type { QuestBeat } from "@/types/quest.types";

export function useFillQuestBeat() {
  const { generate, error, isGenerating } = useQuestBeatFill();
  const updateBeat = useUpdateQuestBeat();

  /** `overwrite`: replace prose the beat already has (the editor asks the DM first; Ask's quote says so). */
  async function fillBeat(input: { beat: QuestBeat; context: BeatFillContext; steer: string; overwrite: boolean }): Promise<QuestBeat | null> {
    const filled = await generate(input.beat.quest_id, input.context, input.steer);
    if (!filled) return null;
    const draft = questBeatToDraft(input.beat);
    applyFilledBeat(draft, { ...filled, overwrite: input.overwrite });
    return await updateBeat.mutateAsync({
      id: input.beat.id,
      questId: input.beat.quest_id,
      update: questBeatDraftToUpdate(draft, input.beat.improv_reviewed_at),
      expectedUpdatedAt: input.beat.updated_at,
    });
  }

  return { fillBeat, error, isGenerating };
}
