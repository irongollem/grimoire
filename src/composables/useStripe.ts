import { ref } from "vue";
import { supabase } from "@/lib/supabase";

export function useStripe() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function createCheckoutSession(interval: "month" | "year" = "month") {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "stripe-create-checkout",
        { body: { interval } },
      );
      if (fnError) throw new Error(fnError.message);
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to start checkout";
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
      if (fnError) throw new Error(fnError.message);
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to open billing portal";
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, createCheckoutSession, openBillingPortal };
}
