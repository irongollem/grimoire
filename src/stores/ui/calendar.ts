// Calendar view state and the dashboard "Upcoming events" filter.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { CalendarEventType } from "@/types/calendar.types";

export const useCalendarUiStore = defineStore("ui:calendar", () => {
  // Calendar UI state
  const calendarViewMode = ref<"year" | "month">("month");

  // Whether the Chronicle timeline also shows the canon's dated lore and force moves, read-only (#1255 item 19).
  // A display choice rather than a filter, so it has no "active filters" state: on is the normal.
  const showCanonOnCalendar = ref(true);

  // Dashboard "Upcoming events" widget (#764). A filter over the list already
  // on the card, so it belongs here rather than in a local ref — the Filter
  // State Pattern's own test. Survives navigating away from the dashboard and
  // back without permanently pinning itself into localStorage.
  const upcomingEventsFilterType = ref<CalendarEventType | "all">("all");

  const upcomingEventsHasActiveFilters = computed(
    () => upcomingEventsFilterType.value !== "all",
  );

  function resetUpcomingEventsFilters() {
    upcomingEventsFilterType.value = "all";
  }

  return {
    calendarViewMode,
    showCanonOnCalendar,
    upcomingEventsFilterType,
    upcomingEventsHasActiveFilters,
    resetUpcomingEventsFilters,
  };
});
