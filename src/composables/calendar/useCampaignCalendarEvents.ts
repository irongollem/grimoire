import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { CalendarEvent } from "@/types/calendar.types";

/**
 * Every Calendar event of the campaign, for the Canon page's almanac, which shows the Calendar's events beside lore
 * and sessions. It sits under the `calendar-events` key, so the campaign doorbell's ring for `calendar_events`
 * refreshes it like the Calendar's own reads.
 */
export function useCampaignCalendarEvents() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => ["calendar-events", "all", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCampaignCalendarEvents fetched without a campaign");
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("campaign_id", cid)
        .order("year", { ascending: true })
        .order("month", { ascending: true, nullsFirst: true })
        .order("day", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data as CalendarEvent[];
    },
    enabled: () => !!campaignId.value,
  });
}
