import { useSetCampaignToday } from "@/composables/campaign/useCampaigns";
import { addDays } from "@/lib/calendar/dayMath";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";

/**
 * Days that passed in the story at the AI table move the campaign's date (#1222): a journey of three days leaves
 * the calendar three days on, by the campaign's own calendar. The page does it, not the server: the calendar's
 * months and leap days live with the app, and the date is the campaign owner's own row. Everything due on a day
 * (weather, a quest's scheduled consequence) follows from the date as it does when a DM moves it by hand.
 */
export function useTableDays(): (days: number) => void {
  const campaign = useCampaignStore();
  const calendar = useCalendarStore();
  const setToday = useSetCampaignToday();
  return (days) => {
    const active = campaign.activeCampaign;
    if (!active || !Number.isInteger(days) || days < 1) return;
    const next = addDays(calendar.adapter, { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay }, days);
    setToday.mutate({ id: active.id, year: next.year, month: next.month, day: next.day });
  };
}
