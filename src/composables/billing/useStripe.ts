import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";

export function useStripe() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Which action `error` belongs to — BillingView shows both buttons to a free
   *  user who already has a Stripe customer, and each renders only its own. */
  const errorFrom = ref<"checkout" | "portal" | null>(null);

  async function createCheckoutSession(
    interval: "month" | "year" = "month",
    withdrawalConsent = false,
    /** Where Stripe sends the buyer back to; Billing when omitted. */
    returnPath?: string,
  ) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "stripe-create-checkout",
        { body: { interval, withdrawalConsent, returnPath } },
      );
      if (fnError) throw new Error(await edgeErrorMessage(fnError));
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to start checkout";
      errorFrom.value = "checkout";
    } finally {
      loading.value = false;
    }
  }

  async function openBillingPortal() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "stripe-create-portal",
      );
      if (fnError) throw new Error(await edgeErrorMessage(fnError));
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to open billing portal";
      errorFrom.value = "portal";
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, errorFrom, createCheckoutSession, openBillingPortal };
}
