import { ref } from "vue";
import { useCreateQuest } from "@/composables/quests/useQuests";
import { useCreateQuestBeatWithRoute } from "@/composables/quests/useQuestFlow";
import { createEntryQuests } from "@/composables/canon/useCanonEntryQuests";
import { useUpdateCanonClue } from "@/composables/canon/useCanonClues";
import { useQueryClient } from "@tanstack/vue-query";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { toast } from "@/lib/toast";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

/** How far apart the beats made from clues sit on the quest's canvas, so they do not pile on one spot. */
const BEAT_SPACING = 280;

/**
 * "Start a quest from this" on a secret or a force (#1279 item 32). It makes a quest titled after the entry, in the
 * entry's arc, tied to the entry the way a hand-linked quest is (`canon_entry_quests`), and, for a secret, one beat per
 * chosen clue with the clue placed at that beat. The quest starts `undiscovered` with no summary: the summary is
 * player-facing and the entry's words may be a secret.
 *
 * The quest row is the one write that must land; the link and each beat are tried after it and a miss is told to the DM
 * and does not undo the quest, as the quest generator treats its spine. Returns the new quest's id, or null when the
 * quest itself could not be made.
 */
export function useStartQuestFrom(entry: () => CanonEntry) {
  const { mutateAsync: createQuest } = useCreateQuest();
  const { mutateAsync: createBeat } = useCreateQuestBeatWithRoute();
  const { mutateAsync: updateClue } = useUpdateCanonClue();
  const qc = useQueryClient();

  /** True while it runs, so a second tap before the first lands makes no second quest. */
  const starting = ref(false);

  async function start(clues: readonly CanonClue[] = []): Promise<string | null> {
    if (starting.value) return null;
    starting.value = true;
    const e = entry();
    try {
      let questId: string;
      try {
        const quest = await createQuest({
          title: e.title,
          summary: null,
          status: "undiscovered",
          giver_npc_id: null,
          location_id: null,
          parent_quest_id: null,
          arc_id: e.arc_id,
          tags: [],
          started_at: null,
          resolved_at: null,
        });
        questId = quest.id;
      } catch (err) {
        toast.error(toast.fromError(err));
        return null;
      }

      try {
        await createEntryQuests([{ campaign_id: e.campaign_id, entry_id: e.id, quest_id: questId }]);
        await qc.invalidateQueries({ queryKey: [CANON_KEY] });
      } catch (err) {
        toast.error(`The quest was made, but it could not be tied to this. ${toast.fromError(err)}`);
      }

      // One beat per clue, one after another so their order is the clues' order. A clue is placed only once its beat exists.
      for (const [i, clue] of clues.entries()) {
        try {
          const beat = await createBeat({ questId, title: clue.title, kind: "discovery", canvasX: i * BEAT_SPACING, canvasY: 0 });
          await updateClue({ id: clue.id, patch: { quest_beat_id: beat.id } });
        } catch (err) {
          toast.error(`The clue “${clue.title}” could not be made a beat. ${toast.fromError(err)}`);
        }
      }
      return questId;
    } finally {
      starting.value = false;
    }
  }

  return { start, starting };
}
