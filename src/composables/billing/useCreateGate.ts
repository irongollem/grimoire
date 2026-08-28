import { ref } from "vue";
import { useRouter } from "vue-router";
import { useQuota } from "@/composables/billing/useQuota";
import type { QuotaResource } from "@/types/subscription.types";

/**
 * Gates a "create new" action behind the free-tier quota. Returns the paywall
 * flag (bind to `<PaywallModal v-model="showPaywall" :resource>`), a `handleNew`
 * for the create button (opens the paywall when over limit, else navigates), and
 * `gateQuotaError` for bulk flows (e.g. "Populate Setting"): pass a caught error
 * and it opens the paywall when the DB quota trigger fired, returning true so the
 * caller can skip surfacing the raw `quota_exceeded` string.
 *
 * Replaces the per-view copy of this logic across every gated list view.
 */
export function useCreateGate(resource: QuotaResource, newRoute: string) {
  const router = useRouter();
  const { canCreate } = useQuota(resource);
  const showPaywall = ref(false);

  function handleNew() {
    if (!canCreate.value) {
      showPaywall.value = true;
      return;
    }
    router.push(newRoute);
  }

  function gateQuotaError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("quota_exceeded")) {
      showPaywall.value = true;
      return true;
    }
    return false;
  }

  return { canCreate, showPaywall, handleNew, gateQuotaError };
}
