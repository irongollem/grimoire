// Calendar view state and the dashboard "Upcoming events" filter.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { CalendarEventType } from "@/types/calendar.types";

export const useCalendarUiStore = defineStore("ui:calendar", () => {
  // Calendar UI state
  const calendarViewMode = ref<"year" | "month">("month");

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
    upcomingEventsFilterType,
    upcomingEventsHasActiveFilters,
    resetUpcomingEventsFilters,
  };
});
