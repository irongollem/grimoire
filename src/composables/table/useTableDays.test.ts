import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const set = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/composables/campaign/useCampaigns", () => ({ useSetCampaignToday: () => set }));

import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import { useTableDays } from "./useTableDays";

beforeEach(() => {
  set.mutate.mockReset();
  setActivePinia(createPinia());
});

describe("useTableDays", () => {
  // Bug caught: three days on the road and the calendar still on the day the party set out; or the days added to
  // the day number alone, so the 30th plus three is the "33rd" instead of the next month.
  it("moves the campaign's date on by the days that passed, across the end of a month", () => {
    const campaign = useCampaignStore();
    const calendar = useCalendarStore();
    const firstMonthDays = calendar.adapter.months[0].days;
    campaign.activeCampaign = { id: "c1", current_year: 1490, current_month: 1, current_day: firstMonthDays } as Campaign;
    useTableDays()(3);
    expect(set.mutate).toHaveBeenCalledTimes(1);
    const sent = set.mutate.mock.calls[0][0] as { id: string; year: number; month: number; day: number };
    expect(sent.id).toBe("c1");
    // Past the last day of the first month: not the same month any more, and never a day beyond a month's length.
    expect(sent.month === 1 && sent.year === 1490).toBe(false);
    expect(sent.day).toBeLessThanOrEqual(3);
  });

  // Bug caught: a date written for nobody, or moved by nothing or backwards.
  it("writes nothing without a campaign, or for less than a whole day", () => {
    useTableDays()(2);
    const campaign = useCampaignStore();
    campaign.activeCampaign = { id: "c1", current_year: 1490, current_month: 1, current_day: 1 } as Campaign;
    useTableDays()(0);
    useTableDays()(-1);
    useTableDays()(1.5);
    expect(set.mutate).not.toHaveBeenCalled();
  });
});
