import { mount } from "@vue/test-utils";
import { computed, reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { getCalendarAdapter } from "@/settings/index";
import SessionWidget from "./SessionWidget.vue";

const h = vi.hoisted(() => ({ campaign: null as unknown as Record<string, unknown> }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => h.campaign }));
// The calendar store still holds the previous campaign's calendar (Faerûn, "DR"):
// it catches up a beat after a switch, and the widget must not read it.
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: getCalendarAdapter("faerun") }),
}));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useSetCampaignToday: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: ref(false) }),
  useSetCampaignLocation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/calendar/useTodayWeather", () => ({ useTodayWeather: () => computed(() => null) }));

describe("SessionWidget game day", () => {
  // Bug it fails on: the date was formatted with the calendar store's adapter, so right
  // after a switch to a Greyhawk campaign it showed "Fireseek, 591 DR" (the old epoch).
  it("names the month and epoch from the active campaign's own calendar, not the calendar store's", async () => {
    h.campaign = reactive({
      todayYear: 1495,
      todayMonth: 1,
      todayDay: 3,
      activeCampaign: { calendar_id: "faerun", custom_calendar: null },
    });
    const w = mount(SessionWidget, {
      global: { stubs: { DashboardWidget: { template: "<div><slot /></div>" }, EntityCombobox: true } },
    });
    expect(w.text()).toContain("3 Hammer, 1495 DR");

    const campaign = h.campaign as { activeCampaign: unknown; todayYear: number };
    campaign.activeCampaign = { calendar_id: "greyhawk", custom_calendar: null };
    campaign.todayYear = 591;
    await w.vm.$nextTick();
    expect(w.text()).toContain("3 Fireseek, 591 CY");
    expect(w.text()).not.toContain("DR");
  });
});
