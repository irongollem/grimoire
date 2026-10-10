// Downtime (The Interlude) filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { DowntimeDrawStatus } from "@/types/downtime.types";

export const useDowntimeUiStore = defineStore("ui:downtime", () => {
  // ── Downtime — The Interlude ───────────────────────────────────────────────
  // Session-scoped (plain refs, not useLocalStorage): filters survive navigation
  // but never permanently pollute localStorage.
  const downtimeFilterStatus = ref<DowntimeDrawStatus | "all">("pending");
  const downtimeFilterCharacter = ref("");

  const downtimeHasActiveFilters = computed(
    () => downtimeFilterStatus.value !== "pending" || downtimeFilterCharacter.value !== "",
  );

  function resetDowntimeFilters() {
    downtimeFilterStatus.value = "pending";
    downtimeFilterCharacter.value = "";
  }

  return {
    downtimeFilterStatus,
    downtimeFilterCharacter,
    downtimeHasActiveFilters,
    resetDowntimeFilters,
  };
});
