// Admin panel filters: focal-point queue, audit log, data-subject requests.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { FocalKind, FocalStatus } from "@/lib/library/focalQueue";
import type { AdminAuditAction } from "@/composables/admin/useAdminAuditLog";

export const useAdminUiStore = defineStore("ui:admin", () => {
  // Admin focal-point queue (#965)
  const focalQueueKind = ref<FocalKind>("monster");
  const focalQueueStatus = ref<FocalStatus>("unchecked");

  const focalQueueHasActiveFilters = computed(
    () => focalQueueKind.value !== "monster" || focalQueueStatus.value !== "unchecked",
  );

  function resetFocalQueueFilters() {
    focalQueueKind.value = "monster";
    focalQueueStatus.value = "unchecked";
  }

  // Admin → Audit (#642)
  const adminAuditSearch = ref("");
  const adminAuditFilterAction = ref<AdminAuditAction | "all">("all");

  const adminAuditHasActiveFilters = computed(
    () => adminAuditSearch.value !== "" || adminAuditFilterAction.value !== "all",
  );

  function resetAdminAuditFilters() {
    adminAuditSearch.value = "";
    adminAuditFilterAction.value = "all";
  }

  // Admin → Requests (#643)
  const adminDsrSearch = ref("");
  const adminDsrFilterStatus = ref<"all" | "open" | "answered">("all");

  const adminDsrHasActiveFilters = computed(
    () => adminDsrSearch.value !== "" || adminDsrFilterStatus.value !== "all",
  );

  function resetAdminDsrFilters() {
    adminDsrSearch.value = "";
    adminDsrFilterStatus.value = "all";
  }

  return {
    focalQueueKind,
    focalQueueStatus,
    focalQueueHasActiveFilters,
    resetFocalQueueFilters,
    adminAuditSearch,
    adminAuditFilterAction,
    adminAuditHasActiveFilters,
    resetAdminAuditFilters,
    adminDsrSearch,
    adminDsrFilterStatus,
    adminDsrHasActiveFilters,
    resetAdminDsrFilters,
  };
});
