import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useChildAccount } from "@/composables/account/useChildAccount";
import type { UserSubscription } from "@/types/subscription.types";

// Filtered on the caller's own id rather than left to RLS: an admin's
// `user_subscriptions_select_admin` policy returns every account's row, so an
// unfiltered `maybeSingle()` errors on the multi-row result. With the error
// swallowed that read as "no row", which kept the #919 Terms gate open forever
// for the admin after `accept_terms` had already succeeded.
async function fetchSubscription(userId: string): Promise<UserSubscription | null> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserSubscription | null;
}

/**
 * Whether this account may start a Pro checkout. Deliberately not `!isPro`:
 * a beta tester already counts as Pro, but tester is a comp the maintainer
 * hands out (often to smooth over a client's bad experience), and they must be
 * able to move to paid whenever they choose. Only a `pro` plan closes the door
 * — the webhook sets it once a subscription is paid and resets the account to
 * `free` when that subscription ends, which mirrors the server's own guard in
 * `stripe-create-checkout` (a live Stripe subscription, never `status` alone).
 */
export function canStartProCheckout(sub: Pick<UserSubscription, "plan_id"> | null): boolean {
  return sub?.plan_id !== "pro";
}

/**
 * Whether a cancellation is scheduled but has not landed yet. Keyed on
 * `cancel_at` alone: on this API version the Stripe customer portal schedules
 * an end-of-period cancellation by setting `cancel_at` and leaves
 * `cancel_at_period_end` false, so requiring both hid every real cancellation
 * and the page kept promising a renewal that will never happen. The webhook
 * writes both fields verbatim; the date is the one that always carries it.
 */
export function isCancellationPending(
  sub: Pick<UserSubscription, "cancel_at" | "status"> | null,
): boolean {
  return !!sub?.cancel_at && sub.status !== "canceled";
}

export function useSubscription() {
  const auth = useAuthStore();
  const { isChild } = useChildAccount();

  const { data, isLoading, error } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => {
      const userId = auth.user?.id;
      if (!userId) throw new Error("fetchSubscription ran without a signed-in user");
      return fetchSubscription(userId);
    },
    staleTime: 60_000,
    enabled: computed(() => !!auth.user),
  });

  // Mirrors the server's `is_user_pro` (#919): a child account is never Pro,
  // regardless of what the row underneath it says — checked first, so it also
  // overrides the admin comp below for the (currently impossible, but not
  // worth trusting) case of an admin account that is also a child.
  const isPro = computed(() => {
    if (isChild.value) return false;
    if (auth.isAppAdmin) return true;
    const sub = data.value;
    return (
      !!sub &&
      (sub.plan_id === "pro" || sub.plan_id === "tester") &&
      ["active", "trialing"].includes(sub.status)
    );
  });

  const isPendingCancellation = computed(() => isCancellationPending(data.value ?? null));

  const canUpgrade = computed(() => canStartProCheckout(data.value ?? null));

  const isSuspended = computed(() => !!data.value?.suspended_at);
  const suspensionReason = computed(() => data.value?.suspension_reason ?? null);

  return { subscription: data, isPro, canUpgrade, isPendingCancellation, isSuspended, suspensionReason, isLoading, error };
}
