/**
 * Everything a beat fill needs to read, for a beat named by id (#1253): the beat, its quest, the quest's beats, routes
 * and objectives, the place it is staged at and how many threads the quest runs. It feeds `buildBeatFillContext`, the
 * builder the drawer's fill bar uses, so the model reads the same context from either.
 *
 * Nothing is read until there is a beat id: Ask Grimoire's adapter lives as long as the panel, on every page.
 * `undefined` while it loads, `null` when the beat is not in the active campaign (the quest says whose it is).
 */
import { computed, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useQuest, useQuestObjectives } from "@/composables/quests/useQuests";
import { useQuestBeat, useQuestBeatEdges, useQuestBeats } from "@/composables/quests/useQuestFlow";
import { useAllLocations } from "@/composables/locations/useLocations";
import { buildBeatFillContext, type BeatFillContext } from "@/lib/quests/beatFill";
import type { Quest, QuestBeat } from "@/types/quest.types";

export interface QuestBeatFillSource {
  beat: QuestBeat;
  quest: Quest;
  context: BeatFillContext;
}

export function useQuestBeatFillSource(beatId: Ref<string | null>) {
  const campaign = useCampaignStore();
  const wanted = computed(() => beatId.value !== null);
  const beatQuery = useQuestBeat(computed(() => beatId.value ?? ""), () => wanted.value);
  const questId = computed(() => beatQuery.data.value?.quest_id ?? "");
  const questQuery = useQuest(questId);
  const beatsQuery = useQuestBeats(questId);
  const edgesQuery = useQuestBeatEdges(questId);
  const objectivesQuery = useQuestObjectives(questId);
  // Only the count is read: opening the quest's thread list would create its Main thread as a side effect.
  const threadCount = useQuery({
    queryKey: computed(() => ["quest-thread-count", questId.value] as const),
    queryFn: async ({ queryKey: [, id] }) => {
      const { count, error } = await supabase.from("quest_threads").select("id", { count: "exact", head: true }).eq("quest_id", id);
      if (error) throw error;
      return count;
    },
    enabled: () => questId.value !== "",
  });
  const needsPlace = computed(() => beatQuery.data.value?.staged_at_location_id != null);
  const locations = useAllLocations(() => needsPlace.value);

  const error = computed(() => beatQuery.error.value ?? questQuery.error.value ?? beatsQuery.error.value
    ?? edgesQuery.error.value ?? objectivesQuery.error.value ?? threadCount.error.value ?? locations.error.value);

  const source = computed<QuestBeatFillSource | null | undefined>(() => {
    if (!wanted.value) return null;
    const beat = beatQuery.data.value;
    const quest = questQuery.data.value;
    const beats = beatsQuery.data.value;
    const edges = edgesQuery.data.value;
    const objectives = objectivesQuery.data.value;
    const threads = threadCount.data.value;
    const placeId = beat?.staged_at_location_id ?? null;
    const places = locations.data.value;
    if (!beat || !quest || !beats || !edges || !objectives || threads === undefined || (placeId !== null && !places)) return undefined;
    if (quest.campaign_id !== campaign.activeCampaignId) return null;
    const place = placeId === null ? null : places?.find((l) => l.id === placeId) ?? null;
    return {
      beat,
      quest,
      context: buildBeatFillContext({
        quest, beat, beats, edges, objectives,
        stagedAt: place ? place.name : null,
        threadCount: threads === null ? 0 : threads,
      }),
    };
  });

  return { source, error };
}
