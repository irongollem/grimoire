<template>
  <AppModal :open="needed !== null" size="md" @close="closeOutOfCredits">
    <ModalHeader
      title="Not enough credits"
      :icon="IconCoins"
      tone="caution"
      closeable
      @close="closeOutOfCredits"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
      <p class="text-body text-muted-foreground leading-snug">
        This costs
        <span class="text-foreground font-semibold">{{ creditsLabel(needed ?? 0) }}</span>
        and your balance is
        <span class="text-foreground font-semibold">{{ creditsLabel(balance ?? 0) }}</span>.
        Top up here and carry on — checkout brings you straight back to this page.
      </p>

      <!-- Free DMs are offered Pro first: its monthly allowance is the better
           deal for anyone generating regularly. Pro and comped accounts never
           see this — they are out of credits, not missing a plan. -->
      <section v-if="!isPro" class="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
        <p class="font-cinzel text-sm font-bold text-foreground tracking-wide">Go Pro</p>
        <p class="text-body text-muted-foreground leading-snug">
          <template v-if="monthlyCredits > 0">
            {{ monthlyCredits.toLocaleString() }} AI credits every month, included —
          </template>
          plus no Free limits and your own API key if you have one.
        </p>
        <WithdrawalConsent v-model="subConsent" kind="subscription" />
        <AppButton
          variant="tinted"
          tone="caution"
          emphasis="solid"
          size="md"
          block
          :loading="stripeLoading"
          :disabled="stripeLoading || !monthlyLabel || !subConsent"
          :label="monthlyLabel ? `Subscribe — ${monthlyLabel}/month` : 'Pricing unavailable'"
          @click="createCheckoutSession('month', subConsent, returnPath)"
        />
        <AppButton
          v-if="yearlyLabel"
          variant="link"
          size="inline-caption"
          :disabled="stripeLoading || !subConsent"
          :label="savedMonths > 0 ? `or ${yearlyLabel}/year — ${savedMonths} months free` : `or ${yearlyLabel}/year`"
          @click="createCheckoutSession('year', subConsent, returnPath)"
        />
        <p v-if="stripeError" role="alert" class="text-caption text-red-400 italic">{{ stripeError }}</p>
      </section>

      <section class="space-y-2">
        <p class="text-eyebrow font-semibold text-muted-foreground">
          {{ isPro ? "Buy a credit pack" : "Or buy a credit pack" }}
        </p>
        <CreditPackPicker :currency="currency" :return-path="returnPath" />
      </section>
    </div>

    <div class="flex shrink-0 justify-end px-5 pb-5">
      <AppButton variant="subtle" size="md" label="Maybe later" @click="closeOutOfCredits" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconCoins } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import WithdrawalConsent from "@/components/billing/WithdrawalConsent.vue";
import CreditPackPicker from "@/components/billing/CreditPackPicker.vue";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useStripe } from "@/composables/billing/useStripe";
import { useProPricing } from "@/composables/billing/useProPricing";
import { useToast } from "@/composables/useToast";
import { detectCurrency } from "@/lib/pricing";

/**
 * The one "not enough credits" dialog, mounted once in App.vue and opened by
 * `useOutOfCredits().requireCredits()` from any AI action. It also confirms a
 * purchase when Stripe sends the buyer back here (the checkout functions put
 * `credit_purchase=success` / `checkout=success` on the return path).
 */
const { needed, closeOutOfCredits } = useOutOfCredits();
const { balance } = useAiCredits();
const { isPro } = useSubscription();
const { loading: stripeLoading, error: stripeError, createCheckoutSession } = useStripe();
const { monthlyLabel, yearlyLabel, savedMonths, monthlyCredits } = useProPricing();
const { success } = useToast();
const route = useRoute();
const router = useRouter();

const currency = detectCurrency();
const subConsent = ref(false);
const returnPath = computed(() => route.fullPath);

function creditsLabel(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded === 1 ? "1 credit" : `${rounded} credits`;
}

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
        ? "Welcome to Pro — your monthly credits are on their way."
        : "Credits bought — they will show in your balance in a moment.",
    );
    const query = { ...route.query };
    delete query.checkout;
    if (boughtCredits) delete query.credit_purchase;
    router.replace({ query });
  },
  { immediate: true },
);
</script>
