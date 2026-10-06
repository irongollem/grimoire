import { useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { writeQuestSpine, type WriteQuestSpineDeps, type WriteQuestSpineInput, type WriteQuestSpineResult } from "@/lib/quests/spineWrite";
import { QUEST_BOARD_KEY } from "@/lib/quests/boardKey";
import { CONSEQUENCES_KEY, EDGES_KEY, invalidatePlayerQuestBeatProjections } from "@/composables/quests/useQuestFlow";
import { BEATS_KEY, OBJECTIVES_KEY } from "@/lib/campaignLiveSync/registry";
import type { QuestBeat, QuestObjective } from "@/types/quest.types";

/** One request per list, never per row (#951). Throwing is the contract:
 *  `writeQuestSpine` isolates a refused list row by row. */
const questSpineDeps: WriteQuestSpineDeps = {
  createBeats: async (beats) => {
    const { data, error } = await supabase.from("quest_beats").insert(beats).select();
    if (error) throw error;
    return data as QuestBeat[];
  },
  createBeatEdges: async (edges) => {
    const { error } = await supabase.from("quest_beat_edges").insert(edges);
    if (error) throw error;
  },
  createObjectives: async (objectives) => {
    const { data, error } = await supabase.from("quest_objectives").insert(objectives).select();
    if (error) throw error;
    return data as QuestObjective[];
  },
  createConsequences: async (consequences) => {
    const { error } = await supabase.from("quest_consequences").insert(consequences);
    if (error) throw error;
  },
};

/**
 * The one Supabase-backed way to write a quest's story spine, shared by the
 * AI quest generator (`useCreateQuestFromHook`) and the document importer
 * (`useDocumentImportRunner`). It replaced four single-row mutations whose
 * `onSuccess` each invalidated their own key once per row; the spine now
 * lands in a handful of requests and the caches are told once, after.
 */
export function useQuestSpineWriter() {
  const queryClient = useQueryClient();

  async function writeSpine(input: WriteQuestSpineInput): Promise<WriteQuestSpineResult> {
    const result = await writeQuestSpine(input, questSpineDeps);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, input.questId] }),
      queryClient.invalidateQueries({ queryKey: [EDGES_KEY, input.questId] }),
      queryClient.invalidateQueries({ queryKey: [OBJECTIVES_KEY, input.questId] }),
      queryClient.invalidateQueries({ queryKey: [CONSEQUENCES_KEY, input.questId] }),
      queryClient.invalidateQueries({ queryKey: [QUEST_BOARD_KEY] }),
      invalidatePlayerQuestBeatProjections(queryClient),
    ]);
    return result;
  }

  return { writeSpine };
}
