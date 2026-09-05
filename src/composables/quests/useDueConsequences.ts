import { computed, watch } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarStore } from "@/stores/calendar";
import { dueConsequenceEvents, type PendingConsequenceEvent } from "@/lib/quests/dueConsequences";

const PENDING_KEY = "quest_consequence_events";

async function fetchPending(campaignId: string): Promise<PendingConsequenceEvent[]> {
  const { data, error } = await supabase
    .from("quest_consequence_events")
    .select("id, after_days, fires_on_year, fires_on_month, fires_on_day")
    .eq("campaign_id", campaignId)
    .is("performed_at", null)
    .is("undone_at", null)
    .gt("after_days", 0);
  if (error) throw error;
  return (data ?? []) as PendingConsequenceEvent[];
}

async function performDue(
  rows: readonly PendingConsequenceEvent[],
  today: { year: number; month: number; day: number },
): Promise<void> {
  for (const row of rows) {
    const { error } = await supabase.rpc("perform_quest_consequence", {
      p_event_id: row.id,
      p_year: today.year,
      p_month: today.month,
      p_day: today.day,
    });
    if (error) throw error;
  }
}

/**
 * Mounted once in the DM shell (`DefaultLayout.vue`), replacing
 * `fireDueTriggers` — which only ever fired from the Calendar page's own
 * "Set Today" button, the one writer of `campaigns.current_year/month/day` it
 * happened to sit beside. `DetailsTab.vue`'s "Current Year" field writes the
 * same columns directly and never called it, so aging a campaign forward from
 * Settings silently fired nothing (#794).
 *
 * Watching the campaign store's own today fields, rather than any one
 * writer's mutation, closes that for both existing writers and any future
 * one — there is exactly one place "today changed" can be observed from: the
 * store the rest of the app already reads it off.
 */
export function useDueConsequences(): void {
  const campaign = useCampaignStore();
  const calendarStore = useCalendarStore();
  const queryClient = useQueryClient();

  const { data: pending } = useQuery({
    queryKey: computed(() => [PENDING_KEY, campaign.activeCampaignId, "pending"]),
    queryFn: () => fetchPending(campaign.activeCampaignId!),
    enabled: () => !!campaign.activeCampaignId,
  });

  watch(
    () => pending.value && campaign.activeCampaignId
      ? {
          rows: pending.value,
          today: { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay },
        }
      : null,
    async (snapshot) => {
      if (!snapshot || !snapshot.rows.length) return;
      const due = dueConsequenceEvents(calendarStore.adapter, snapshot.rows, snapshot.today);
      if (!due.length) return;
      await performDue(due, snapshot.today);
      queryClient.invalidateQueries({ queryKey: [PENDING_KEY] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    { immediate: true },
  );
}
