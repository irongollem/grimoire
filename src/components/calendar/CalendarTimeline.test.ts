import { mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarTimeline from "./CalendarTimeline.vue";

// Two months (31 and 28 days) and a 7-day week: 31 / 7 is not whole, which is the point.
const adapter = {
  id: "t",
  name: "T",
  epochName: "TE",
  defaultYear: 1495,
  months: [
    { num: 1, name: "Long", days: 31 },
    { num: 2, name: "Short", days: 28 },
  ],
  intercalaryDays: [],
  weekSize: 7,
  moons: [],
  seasons: [],
  isLeapYear: () => false,
  formatDate: () => "",
};

const stores = vi.hoisted(() => ({
  calendar: null as unknown as Record<string, unknown>,
  campaign: null as unknown as Record<string, unknown>,
}));

vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => stores.calendar }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => stores.campaign }));
vi.mock("@/composables/calendar/useCalendarEvents", () => ({
  useCalendarEventsRange: () => ({ data: ref([]), isLoading: ref(false) }),
}));

const ControlsStub = {
  name: "CalendarTimelineControls",
  props: ["rangeLabel"],
  template: "<div class='range'>{{ rangeLabel }}</div>",
};

function mountTimeline() {
  return mount(CalendarTimeline, {
    global: { stubs: { CalendarTimelineControls: ControlsStub, CalendarTimelineEventList: true } },
  });
}

beforeEach(() => {
  stores.calendar = reactive({
    adapter,
    currentYear: 1495,
    currentMonth: 1,
    // One week of the 59-day year: the week zoom.
    timelineZoom: 7 / 59,
    setTimelineZoom: vi.fn(),
    prevMonth: vi.fn(),
    nextMonth: vi.fn(),
    goToYear: vi.fn(),
  });
  stores.campaign = reactive({ todayYear: 1495, todayMonth: 1, todayDay: 5 });
});

describe("CalendarTimeline week zoom", () => {
  // Bug it fails on: weeks per month was floor(31 / 7) = 4, so days 29-31 of a
  // 31-day month had no week to view and "next" skipped straight to the next month.
  // Also: the fifth week drew ticks for days 32-35 that the month does not have.
  it("reaches a 31-day month's last short week and draws only its three real days", async () => {
    const w = mountTimeline();
    const controls = w.findComponent({ name: "CalendarTimelineControls" });
    for (let i = 0; i < 4; i++) {
      controls.vm.$emit("shift-forward");
      await w.vm.$nextTick();
    }
    expect(stores.calendar.nextMonth).not.toHaveBeenCalled();
    expect(w.find(".range").text()).toContain("Tenday 5");
    const labels = w.findAll("span").map((x) => x.text());
    expect(labels).toEqual(expect.arrayContaining(["29 Long", "30", "31"]));
    expect(labels).not.toContain("32");
    expect(labels).not.toContain("35");

    controls.vm.$emit("shift-forward");
    await w.vm.$nextTick();
    expect(stores.calendar.nextMonth).toHaveBeenCalledTimes(1);
  });
});

describe("CalendarTimeline today marker", () => {
  // Bug it fails on: a today of month 13 on a 2-month calendar was drawn at the
  // start of the year (an unplaceable date falls back there), a false "Today" line.
  it("draws no Today marker for a date the active calendar has no slot for", async () => {
    expect(mountTimeline().text()).toContain("Today");

    stores.campaign.todayMonth = 13;
    expect(mountTimeline().text()).not.toContain("Today");
  });

  it("draws no Today marker for a day past the month's length", () => {
    stores.campaign.todayMonth = 2;
    stores.campaign.todayDay = 30; // Short has 28
    expect(mountTimeline().text()).not.toContain("Today");
  });
});
