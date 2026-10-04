<template>
  <OutOfCreditsDialog v-if="mounted" />
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import OutOfCreditsDialog from "@/components/billing/OutOfCreditsDialog.vue";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useLazyMount } from "@/composables/useLazyMount";
import { useToast } from "@/composables/useToast";

/**
 * The one "not enough credits" dialog, mounted once in App.vue and opened by
 * `useOutOfCredits().requireCredits()` from any AI action. It also confirms a
 * purchase when Stripe sends the buyer back here (the checkout functions put
 * `credit_purchase=success` / `checkout=success` on the return path).
 *
 * This shell stays mounted for the Stripe-return toast; the dialog itself (and
 * the credit, provider and plan reads it makes) mounts on first need and then
 * stays, so closing it does not discard a half-made consent tick.
 */
const { needed } = useOutOfCredits();
const mounted = useLazyMount(computed(() => needed.value !== null));
const { success } = useToast();
const route = useRoute();
const router = useRouter();

// Back from Stripe: say so, then drop the flag so a reload does not repeat it.
// Billing shows its own banner for a credit purchase, so it is left alone there.
watch(
  () => [route.query.credit_purchase, route.query.checkout] as const,
  ([creditPurchase, checkout]) => {
    const boughtCredits = creditPurchase === "success" && route.path !== "/billing";
    const subscribed = checkout === "success";
    if (!boughtCredits && !subscribed) return;
    success(
      subscribed
        ? "Welcome to Pro. Your monthly credits are on their way."
        : "Credits bought. They will show in your balance in a moment.",
    );
    const query = { ...route.query };
    delete query.checkout;
    if (boughtCredits) delete query.credit_purchase;
    router.replace({ query });
  },
  { immediate: true },
);
</script>
