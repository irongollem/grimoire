/**
 * How many more rows of each import kind the DM's plan has room for — the
 * pre-flight half of `reviewDecisions.ts`'s `quotaShortfalls`, shared by both
 * review surfaces (the settings wizard's summary and the quest paste panel).
 *
 * One `check_all_quotas` round-trip via `useAllQuotas`, mapped through each
 * kind's `quotaResource` (`entityKinds.ts`). `null` means "no limit": a kind
 * with no quota table, an unlimited plan, or an admin (for whom `useAllQuotas`
 * skips the call and returns nothing).
 */
import { computed } from "vue";
import { useAllQuotas } from "@/composables/billing/useQuota";
import { getEntityKindEntry } from "@/lib/documentImport/entityKinds";
import type { ImportEntityKind } from "@/types/documentImport.types";

export function useImportQuotaRoom() {
  const { data, isLoading } = useAllQuotas();

  const roomFor = computed(() => (kind: ImportEntityKind): number | null => {
    const resource = getEntityKindEntry(kind).quotaResource;
    if (resource === null) return null;
    const quota = data.value?.[resource];
    if (!quota || quota.unlimited) return null;
    return Math.max(0, quota.limit - quota.current);
  });

  return { roomFor, isLoading };
}
