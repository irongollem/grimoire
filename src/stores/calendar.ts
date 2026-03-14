import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getCalendarAdapter, listCalendarAdapters } from "@/calendars/index";
import type { CalendarAdapter } from "@/types/calendar.types";

export type CalendarView = "month" | "timeline";
// Number of years shown in timeline. Sub-year values: 1/12 ≈ 0.083 (1 month), 1 = 1 year.
export type TimelineZoom = number;

const POSITION_KEY = "grimoire_calendar_position";

function loadPosition(): { year: number; month: number } {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return { year: 1495, month: 1 };
}

export const useCalendarStore = defineStore("calendar", () => {
  // Which calendar system is active (per campaign, defaults to Faerûn)
  const activeCalendarId = ref<string>("faerun");

  // Active view
  const view = ref<CalendarView>("month");

  // Timeline zoom: number of years shown
  const timelineZoom = ref<TimelineZoom>(20);

  // Current view position — persisted to localStorage
  const savedPos = loadPosition();
  const currentYear = ref<number>(savedPos.year);
  const currentMonth = ref<number>(savedPos.month);

  watch([currentYear, currentMonth], ([year, month]) => {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ year, month }));
  });

  const adapter = computed<CalendarAdapter>(() => getCalendarAdapter(activeCalendarId.value));

  const availableCalendars = computed(() => listCalendarAdapters());

  function setCalendar(id: string) {
    const cal = getCalendarAdapter(id);
    activeCalendarId.value = cal.id;
    currentYear.value = cal.defaultYear;
    currentMonth.value = 1;
  }

  function prevMonth() {
    if (currentMonth.value === 1) {
      currentMonth.value = adapter.value.months.length;
      currentYear.value--;
    } else {
      currentMonth.value--;
    }
  }

  function nextMonth() {
    if (currentMonth.value === adapter.value.months.length) {
      currentMonth.value = 1;
      currentYear.value++;
    } else {
      currentMonth.value++;
    }
  }

  function goToYear(year: number) {
    currentYear.value = year;
  }

  function goToMonth(year: number, month: number) {
    currentYear.value = year;
    currentMonth.value = month;
  }

  function setView(v: CalendarView) {
    view.value = v;
  }

  function setTimelineZoom(z: TimelineZoom) {
    timelineZoom.value = z;
  }

  return {
    activeCalendarId,
    view,
    timelineZoom,
    currentYear,
    currentMonth,
    adapter,
    availableCalendars,
    setCalendar,
    prevMonth,
    nextMonth,
    goToYear,
    goToMonth,
    setView,
    setTimelineZoom,
  };
});
