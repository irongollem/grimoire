import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { getCalendarAdapter, listCalendarAdapters } from "@/calendars/index";
import type { CalendarAdapter } from "@/types/calendar.types";
import type { SettingCalendarDef } from "@/settings/types";

export type CalendarView = "month" | "timeline";
// Number of years shown in timeline. Sub-year values: 1/12 ≈ 0.083 (1 month), 1 = 1 year.
export type TimelineZoom = number;

const POSITION_KEY = "grimoire_calendar_position";

const DEFAULT_ZOOM = 10 / 365; // 1 week (weekSize / 365 for Harptos)

function loadPosition(): { year: number; month: number; calendarId: string; zoom: number } {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        year: parsed.year ?? 1495,
        month: parsed.month ?? 1,
        calendarId: parsed.calendarId ?? "faerun",
        zoom: parsed.zoom ?? DEFAULT_ZOOM,
      };
    }
  } catch {
    // ignore
  }
  return { year: 1495, month: 1, calendarId: "faerun", zoom: DEFAULT_ZOOM };
}

export const useCalendarStore = defineStore("calendar", () => {
  // Load persisted position once at store init
  const savedPos = loadPosition();

  // Which calendar system is active (per campaign, defaults to Faerûn)
  const activeCalendarId = ref<string>(savedPos.calendarId);

  // When activeCalendarId === 'custom', this holds the per-campaign calendar definition.
  const customCalendarDef = ref<SettingCalendarDef | null>(null);

  // Active view
  const view = ref<CalendarView>("month");

  // Timeline zoom: number of years shown
  const timelineZoom = ref<TimelineZoom>(savedPos.zoom);

  // Current view position — persisted to localStorage
  const currentYear = ref<number>(savedPos.year);
  const currentMonth = ref<number>(savedPos.month);

  watch([activeCalendarId, currentYear, currentMonth, timelineZoom], ([calendarId, year, month, zoom]) => {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ calendarId, year, month, zoom }));
  });

  const adapter = computed<CalendarAdapter>(() =>
    getCalendarAdapter(activeCalendarId.value, customCalendarDef.value),
  );

  const availableCalendars = computed(() => listCalendarAdapters());

  function setCalendar(id: string, customDef: SettingCalendarDef | null = null) {
    customCalendarDef.value = id === "custom" ? customDef : null;
    const cal = getCalendarAdapter(id, customCalendarDef.value);
    activeCalendarId.value = id === "custom" ? "custom" : cal.id;
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

  /** Called by the campaign store when switching campaigns. Syncs calendar system + year + month. */
  function loadFromCampaign(
    calendarId: string,
    year: number,
    month = 1,
    customDef: SettingCalendarDef | null = null,
  ) {
    customCalendarDef.value = calendarId === "custom" ? customDef : null;
    const cal = getCalendarAdapter(calendarId, customCalendarDef.value);
    activeCalendarId.value = calendarId === "custom" ? "custom" : cal.id;
    currentYear.value = year;
    currentMonth.value = month;
  }

  // ── Event highlighting (used when navigating from inline event refs) ─────────

  const highlightedEventId = ref<string | null>(null);

  function setHighlightedEvent(id: string | null) {
    highlightedEventId.value = id;
  }

  return {
    activeCalendarId,
    customCalendarDef,
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
    loadFromCampaign,
    highlightedEventId,
    setHighlightedEvent,
  };
});
