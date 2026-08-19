<template>
  <div class="max-w-2xl mx-auto px-4 py-8 space-y-6">
    <PageHeader title="Billing & Subscription">
      <template #title-suffix>
        <ManualHelpLink page="billing-subscription" />
      </template>
    </PageHeader>

    <!-- Credit purchase success banner -->
    <div
      v-if="creditPurchaseSuccess"
      class="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 flex items-center gap-3"
    >
      <IconGenerate class="h-4 w-4 text-green-400 shrink-0" />
      <p class="text-body text-green-400">
        Credits added to your account — thanks for your purchase!
      </p>
    </div>

    <!-- Current plan card -->
    <div class="rounded-xl border bg-card p-6 space-y-4">
      <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
        Current plan
      </h2>

      <div
        v-if="isLoading"
        class="flex items-center gap-2 text-muted-foreground"
      >
        <IconLoading class="h-4 w-4 animate-spin" />
        <span class="text-body italic">Loading…</span>
      </div>

      <template v-else>
        <div class="flex items-center gap-3">
          <IconDM v-if="isPro" class="h-5 w-5 text-amber-400 shrink-0" />
          <IconQuest v-else class="h-5 w-5 text-muted-foreground shrink-0" />
          <span
            class="text-heading font-bold"
            :class="isPro ? 'text-amber-400' : 'text-foreground'"
          >
            {{ isPro ? "Pro DM" : "Free DM" }}
          </span>
          <span
            v-if="subscription"
            class="ml-1 px-2 py-0.5 rounded-full text-eyebrow font-semibold"
            :class="statusClass"
          >
            {{ subscription.status }}
          </span>
        </div>

        <p
          v-if="isPendingCancellation && cancelDate"
          class="text-body text-amber-400 italic"
        >
          Cancels {{ cancelDate }} — Pro access until then.
        </p>
        <p
          v-else-if="isPro && renewalDate"
          class="text-body text-muted-foreground italic"
        >
          Renews {{ renewalDate }}
        </p>
        <p
          v-else-if="subscription?.status === 'past_due'"
          class="text-body text-red-400 italic"
        >
          Payment failed — update your payment method to restore access.
        </p>
        <p
          v-else-if="subscription?.status === 'cancelled'"
          class="text-body text-muted-foreground italic"
        >
          Your Pro subscription has ended.
        </p>

        <!-- Pre-downgrade impact warning — shown when cancellation is pending + user is over free quotas -->
        <div
          v-if="isPendingCancellation && downgradeImpact.length > 0"
          class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-1"
        >
          <p class="text-eyebrow font-semibold text-amber-400">
            On cancellation
          </p>
          <ul class="space-y-0.5">
            <li
              v-for="item in downgradeImpact"
              :key="item.label"
              class="text-caption text-muted-foreground italic"
            >
              {{ item.label }}: {{ item.current }} → limit {{ item.limit }} ({{ item.excess }} will be locked)
            </li>
          </ul>
          <p class="text-caption text-muted-foreground italic">
            Content over your free limits will be locked, not deleted. Upgrade to restore access.
          </p>
        </div>

        <!-- Manage billing — only once a Stripe customer exists -->
        <AppButton
          v-if="subscription?.stripe_customer_id"
          variant="subtle"
          size="lg"
          :loading="stripeLoading"
          :icon="IconBilling"
          label="Manage billing"
          @click="openBillingPortal()"
        />
      </template>
    </div>

    <!-- Upgrade CTA (free / lapsed users) -->
    <div
      v-if="!isLoading && !isPro"
      class="rounded-xl border border-amber-500/30 bg-amber-500/5 relative overflow-hidden p-6 space-y-5"
    >
      <div
        class="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-400/50 to-transparent"
      />

      <div>
        <p
          class="font-cinzel text-xs font-semibold tracking-[0.2em] text-amber-400 uppercase mb-1"
        >
          Upgrade to Pro
        </p>
        <h2 class="text-heading-lg font-bold text-amber-400">
          Unlock your full legend
        </h2>
      </div>

      <!-- Feature comparison -->
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p
            class="font-cinzel font-semibold text-muted-foreground mb-2 tracking-wide"
          >
            Free
          </p>
          <ul class="space-y-1.5">
            <li
              v-for="item in freeFeatures"
              :key="item"
              class="flex items-start gap-2"
            >
              <span
                class="h-3.5 w-3.5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5 text-2xs text-muted-foreground font-bold"
                >✓</span
              >
              <span
                class="font-fell italic text-muted-foreground leading-tight"
                >{{ item }}</span
              >
            </li>
          </ul>
        </div>
        <div>
          <p
            class="font-cinzel font-semibold text-amber-400 mb-2 tracking-wide"
          >
            Pro
          </p>
          <ul class="space-y-1.5">
            <li
              v-for="item in proFeatures"
              :key="item"
              class="flex items-start gap-2"
            >
              <span
                class="h-3.5 w-3.5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5 text-2xs text-amber-400 font-bold"
                >✓</span
              >
              <span
                class="font-fell italic text-muted-foreground leading-tight"
                >{{ item }}</span
              >
            </li>
          </ul>
        </div>
      </div>

      <!-- Billing toggle -->
      <div class="flex items-center gap-3">
        <button
          class="text-label-lg font-semibold transition-colors"
          :class="
            !annual
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="annual = false"
        >
          Monthly
        </button>
        <ToggleSwitch v-model="annual" aria-label="Annual billing" />
        <button
          class="text-label-lg font-semibold transition-colors"
          :class="
            annual
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="annual = true"
        >
          Annual
          <span v-if="savedMonths > 0" class="ml-1 text-2xs text-amber-400">save {{ savedMonths }} months</span>
        </button>
        <SegmentedControl
          v-if="pricingCurrencies.length > 1"
          v-model="currency"
          :options="currencyOptions"
          size="xs"
          class="ml-auto"
        />
      </div>

      <div class="flex items-end gap-2">
        <span class="text-display font-bold text-amber-400">{{ activeProPrice ?? "—" }}</span>
        <span class="text-body text-muted-foreground italic mb-1">{{
          annual ? "/ year" : "/ month"
        }}</span>
        <span
          v-if="activeTaxNote"
          class="text-caption text-muted-foreground/70 italic mb-1"
        >{{ activeTaxNote }}</span>
      </div>

      <p
        v-if="proMonthlyCredits > 0"
        class="text-caption text-amber-400/90 italic -mt-2"
      >
        Includes {{ proMonthlyCredits.toLocaleString() }} AI credits every month.
      </p>

      <WithdrawalConsent v-model="subConsent" kind="subscription" class="mb-1" />

      <AppButton
        variant="tinted"
        tone="caution"
        emphasis="solid"
        size="md"
        block
        :loading="stripeLoading"
        :disabled="stripeLoading || !activeProPrice || !subConsent"
        :label="
          stripeLoading
            ? 'Redirecting…'
            : !activeProPrice
              ? 'Pricing unavailable'
              : annual
                ? `Upgrade — ${activeProPrice}/year`
                : `Upgrade — ${activeProPrice}/month`
        "
        @click="createCheckoutSession(annual ? 'year' : 'month', subConsent)"
      />

      <p class="text-caption text-muted-foreground italic text-center">
        Cancel anytime from the billing portal. No hidden fees. Taxes calculated at checkout.
      </p>
    </div>

    <!-- AI credits -->
    <div class="rounded-xl border border-border bg-card p-6 space-y-4">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <IconGenerate class="h-4 w-4 text-primary shrink-0" />
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
            AI credits
          </h2>
        </div>
        <div v-if="creditsLoading" class="flex items-center gap-1.5 text-muted-foreground">
          <IconLoading class="h-3.5 w-3.5 animate-spin" />
          <span class="font-cinzel text-xs">Loading…</span>
        </div>
        <span v-else class="text-heading font-bold text-primary">
          {{ formattedBalance }}
        </span>
      </div>

      <!-- Bucket breakdown: monthly allowance (resets) vs purchased (permanent) -->
      <div
        v-if="!creditsLoading && (subscriptionBalance > 0 || purchasedBalance > 0)"
        class="flex flex-wrap gap-x-4 gap-y-1 text-xs"
      >
        <span class="font-fell text-muted-foreground">
          <span class="font-semibold text-foreground">{{ subscriptionBalance.toLocaleString() }}</span>
          monthly<span v-if="renewalDate"> · resets {{ renewalDate }}</span>
        </span>
        <span class="font-fell text-muted-foreground">
          <span class="font-semibold text-foreground">{{ purchasedBalance.toLocaleString() }}</span>
          purchased · never expires
        </span>
      </div>

      <p class="text-caption text-muted-foreground italic leading-relaxed">
        <template v-if="isPro && proMonthlyCredits > 0">
          Your Pro plan includes {{ proMonthlyCredits.toLocaleString() }} credits each billing period
          (use-it-or-lose-it). Purchased packs are permanent and top up whenever you need more.
        </template>
        <template v-else>
          Credits power AI generation — portraits, scenes, stat blocks and more. Purchased packs never expire;
          upgrade to Pro for a monthly included allowance.
        </template>
      </p>

      <!-- Credit pack purchase -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-eyebrow font-semibold text-muted-foreground">
            Buy more credits
          </p>
          <SegmentedControl
            v-if="pricingCurrencies.length > 1"
            v-model="currency"
            :options="currencyOptions"
            size="xs"
          />
        </div>
        <WithdrawalConsent v-model="packConsent" kind="credit_pack" />
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="pack in creditPacks"
            :key="pack.pack_id"
            class="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/30 p-3 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="purchaseLoading || !packConsent"
            @click="purchasePack(pack.pack_id, packConsent)"
          >
            <span class="font-cinzel text-xs font-bold text-foreground">{{ pack.credits }} credits</span>
            <span class="text-caption italic text-muted-foreground">{{ formatPackPrice(pack) }}</span>
            <span class="text-eyebrow text-muted-foreground/70">{{ pack.label }}</span>
          </button>
        </div>
        <p class="text-caption text-muted-foreground/60 italic">
          Taxes calculated at checkout based on your location.
        </p>
        <p v-if="purchaseError" class="text-caption text-red-400 italic">
          {{ purchaseError }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { IconBilling, IconDM, IconGenerate, IconLoading, IconQuest } from '@/lib/icons';
import PageHeader from "@/components/common/PageHeader.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import WithdrawalConsent from "@/components/billing/WithdrawalConsent.vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { useSubscription } from "@/composables/useSubscription";
import { useStripe } from "@/composables/useStripe";
import { useAiCredits } from "@/composables/useAiCredits";
import { usePlan } from "@/composables/usePlan";
import { useAllQuotas } from "@/composables/useQuota";
import { QUOTA_RESOURCE_LABELS, QUOTA_RESOURCES } from "@/types/subscription.types";
import { useCreditPacks } from "@/composables/useCreditConfig";
import { detectCurrency, resolveAmount, availableCurrencies, formatCents, taxNote } from "@/lib/pricing";

const route = useRoute();
const creditPurchaseSuccess = computed(() => route.query.credit_purchase === "success");

// R3: EU withdrawal-waiver consent, ticked before a purchase, passed to the
// checkout function which records it (timestamp + version) server-side.
const subConsent = ref(false);
const packConsent = ref(false);

const { subscription, isPro, isPendingCancellation, isLoading } = useSubscription();
const {
  loading: stripeLoading,
  createCheckoutSession,
  openBillingPortal,
} = useStripe();
const {
  formattedBalance,
  subscriptionBalance,
  purchasedBalance,
  isLoading: creditsLoading,
  purchasePack,
  purchaseLoading,
  purchaseError,
} = useAiCredits();

const { data: creditPacks } = useCreditPacks();

const { data: freePlan } = usePlan("free");
const { data: proPlan } = usePlan("pro");

const annual = ref(false);
const currency = ref(detectCurrency());

const pricingCurrencies = computed(() =>
  availableCurrencies(
    proPlan.value?.stripe_currency,
    proPlan.value?.stripe_monthly_currency_options,
    proPlan.value?.stripe_annual_currency_options,
    ...( creditPacks.value?.map(p => p.stripe_currency_options) ?? [] ),
  )
);

// Display-only wiring for the two currency-toggle SegmentedControls — same
// pricingCurrencies list, shaped into the {value, label} pairs the primitive wants.
const currencyOptions = computed(() => pricingCurrencies.value.map((c) => ({ value: c, label: c })));

// Prices come exclusively from Stripe (synced into the plans table). No hardcoded
// fallback — if a price isn't configured yet we show "—" rather than a fake one.
const monthlyResolved = computed(() =>
  resolveAmount(
    proPlan.value?.stripe_monthly_unit_amount,
    proPlan.value?.stripe_currency,
    proPlan.value?.stripe_monthly_currency_options,
    currency.value,
  ),
);

const annualResolved = computed(() =>
  resolveAmount(
    proPlan.value?.stripe_annual_unit_amount,
    proPlan.value?.stripe_currency,
    proPlan.value?.stripe_annual_currency_options,
    currency.value,
  ),
);

const proMonthlyDisplay = computed<string | null>(() => {
  const r = monthlyResolved.value;
  return r ? formatCents(r.amount, r.currency) : null;
});

const proAnnualDisplay = computed<string | null>(() => {
  const r = annualResolved.value;
  return r ? formatCents(r.amount, r.currency) : null;
});

/** The active price for the selected billing interval, or null if unconfigured. */
const activeProPrice = computed(() => (annual.value ? proAnnualDisplay.value : proMonthlyDisplay.value));

/** Qualitative tax hint ("incl. VAT" / "+ tax") for the price/interval shown. */
const activeTaxNote = computed(() => {
  const r = annual.value ? annualResolved.value : monthlyResolved.value;
  return r ? taxNote(r.taxBehavior) : null;
});

/** Months saved by paying annually vs 12× monthly (0 until both prices load). */
const savedMonths = computed(() => {
  const mo = monthlyResolved.value;
  const yr = annualResolved.value;
  if (!mo || !yr || mo.amount <= 0) return 0;
  return Math.round((mo.amount * 12 - yr.amount) / mo.amount);
});

/** Monthly included-credit allowance for the Pro plan (0 until configured). */
const proMonthlyCredits = computed(() => proPlan.value?.monthly_credits ?? 0);

function formatPackPrice(pack: { stripe_unit_amount: number | null; stripe_currency: string | null; stripe_currency_options: Record<string, { unit_amount: number }> | null }): string {
  if (!pack.stripe_unit_amount || !pack.stripe_currency) return "";
  const r = resolveAmount(pack.stripe_unit_amount, pack.stripe_currency, pack.stripe_currency_options, currency.value);
  return r ? formatCents(r.amount, r.currency) : "";
}

const renewalDate = computed(() => {
  const end = subscription.value?.current_period_end;
  if (!end) return null;
  return new Date(end).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const cancelDate = computed(() => {
  const at = subscription.value?.cancel_at;
  if (!at) return null;
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const statusClass = computed(() => {
  switch (subscription.value?.status) {
    case "active":
      return "bg-green-500/15 text-green-400";
    case "trialing":
      return "bg-blue-500/15 text-blue-400";
    case "past_due":
      return "bg-orange-500/15 text-orange-400";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
});

// Pre-downgrade impact: which resources are currently over the free-plan limit.
// One batched RPC for all resources instead of one check_quota call per resource.
const { data: allQuotas } = useAllQuotas()

const downgradeImpact = computed(() => {
  const freeQuotas = freePlan.value?.quotas ?? {}
  const counts = allQuotas.value ?? {}
  return QUOTA_RESOURCES.flatMap(r => {
    const limit = freeQuotas[r]
    if (limit === null || limit === undefined) return []
    const quota = counts[r]
    if (!quota) return [] // not loaded yet (or admin) → nothing to warn about
    if (quota.current <= limit) return []
    return [{ label: QUOTA_RESOURCE_LABELS[r], current: quota.current, limit, excess: quota.current - limit }]
  })
})

const freeFeatures = computed(() => {
  const quotas = freePlan.value?.quotas ?? {}
  const campaignLimit = quotas.campaigns ?? 1
  return [
    "All DM tools",
    `Up to ${campaignLimit} campaign${campaignLimit === 1 ? "" : "s"}`,
    "Full player portal",
    "No player fees",
  ]
})

const proFeatures = computed(() => [
  "Unlimited campaigns & content",
  proMonthlyCredits.value > 0
    ? `${proMonthlyCredits.value.toLocaleString()} AI credits / month`
    : "Included AI credits / month",
  "Full player portal",
  "No player fees — ever",
])
</script>
