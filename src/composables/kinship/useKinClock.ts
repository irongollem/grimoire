import { computed } from "vue";
import type { KinClock } from "@/components/kinship/kinLifeMeta";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";

/** The campaign calendar and date that kin ages are measured against. */
export function useKinClock() {
  const calendar = useCalendarStore();
  const campaign = useCampaignStore();
  return computed<KinClock>(() => ({
    adapter: calendar.adapter,
    today: { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay },
  }));
}
