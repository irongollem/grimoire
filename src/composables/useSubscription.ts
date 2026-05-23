import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import type { UserSubscription } from "@/types/subscription.types";

async function fetchSubscription(): Promise<UserSubscription | null> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("*")
    .maybeSingle();
  return data as UserSubscription | null;
}

export function useSubscription() {
  const auth = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
    staleTime: 60_000,
    enabled: computed(() => !!auth.user),
  });

  const isPro = computed(() => {
    if (auth.isAppAdmin) return true;
    const sub = data.value;
    return (
      !!sub &&
      (sub.plan_id === "pro" || sub.plan_id === "tester" || sub.plan_id === "patron") &&
      ["active", "trialing"].includes(sub.status)
    );
  });

  const isPatron = computed(() => {
    const sub = data.value;
    return (
      !!sub &&
      sub.plan_id === "patron" &&
      sub.subscription_provider === "patreon" &&
      ["active", "trialing"].includes(sub.status)
    );
  });

  const isPatronBilling = computed(() => data.value?.subscription_provider === "patreon");

  const isPendingCancellation = computed(() => {
    const sub = data.value;
    return !!sub?.cancel_at_period_end && !!sub.cancel_at;
  });

  return { subscription: data, isPro, isPatron, isPatronBilling, isPendingCancellation, isLoading };
}
