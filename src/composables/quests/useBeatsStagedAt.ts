// Beats staged at a site or any of its spaces (#868, S11) — what
// `SiteRunBeatCard` needs to know a beat is waiting here even when no quest
// cockpit is open. `quest_beats.staged_at_location_id` already names the
// place; this is the reverse read, the same direction `useSitePlacements`
// takes for placements and `useSiteDoors` takes for doors.

import { computed } from "vue";
import type { Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { QuestBeat, QuestStatus } from "@/types/quest.types";

const QUERY_KEY = "beats-staged-at";

/** A quest a beat can no longer usefully prompt from — its ledger is
 *  settled, so an old staging is history, not something to raise tonight. */
const SETTLED_QUEST_STATUSES: readonly QuestStatus[] = ["completed", "failed"];

export interface StagedQuestBeat extends QuestBeat {
  quest: { id: string; title: string; status: QuestStatus } | null;
}

async function fetchBeatsStagedAt(campaignId: string, spaceIds: readonly string[]): Promise<StagedQuestBeat[]> {
  if (!spaceIds.length) return [];
  const { data, error } = await supabase
    .from("quest_beats")
    .select("*, quest:quests(id, title, status)")
    .eq("campaign_id", campaignId)
    .in("staged_at_location_id", spaceIds);
  if (error) throw error;
  // Filtered client-side rather than via a `quest.status` PostgREST filter:
  // a beat orphaned of its quest row (shouldn't happen, `quest_id` is a real
  // FK) would otherwise vanish silently instead of just never matching the
  // settled check.
  return (data as StagedQuestBeat[]).filter((beat) => beat.quest && !SETTLED_QUEST_STATUSES.includes(beat.quest.status));
}

/**
 * Beats staged at any of `spaceIds`, in the active campaign, on a quest that
 * isn't settled yet. `spaceIds` is left to the caller — the site runner
 * passes only the site itself and the party's current room, since a beat
 * staged at a room the party isn't standing in has nothing to prompt right
 * now (see `SiteRunSurface`'s own gating).
 */
export function useBeatsStagedAt(spaceIds: Ref<string[]>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  // Sorted so the query key is stable across re-renders that reorder the
  // same space set — same reasoning as `useSiteDoors`/`useSitePlacements`.
  const sortedIds = computed(() => [...spaceIds.value].sort());
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value, sortedIds.value]),
    queryFn: () => fetchBeatsStagedAt(campaignId.value!, spaceIds.value),
    enabled: () => !!campaignId.value && spaceIds.value.length > 0,
  });
}
