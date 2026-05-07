<template>
  <div class="max-w-2xl mx-auto px-4 py-8 space-y-6">
    <PageHeader title="Billing & Subscription" />

    <!-- Credit purchase success banner -->
    <div
      v-if="creditPurchaseSuccess"
      class="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 flex items-center gap-3"
    >
      <IconGenerate class="h-4 w-4 text-green-400 shrink-0" />
      <p class="font-fell text-sm text-green-400">
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
        <span class="font-fell text-sm italic">Loading…</span>
      </div>

      <template v-else>
        <div class="flex items-center gap-3">
          <IconDM v-if="isPro" class="h-5 w-5 text-amber-400 shrink-0" />
          <IconQuest v-else class="h-5 w-5 text-muted-foreground shrink-0" />
          <span
            class="font-cinzel text-lg font-bold"
            :class="isPro ? 'text-amber-400' : 'text-foreground'"
          >
            {{ isPro ? "Pro DM" : "Free DM" }}
          </span>
          <span
            v-if="subscription"
            class="ml-1 px-2 py-0.5 rounded-full font-cinzel text-[10px] font-semibold tracking-wider uppercase"
            :class="statusClass"
          >
            {{ subscription.status }}
          </span>
        </div>

        <p
          v-if="isPendingCancellation && cancelDate"
          class="font-fell text-sm text-amber-400 italic"
        >
          Cancels {{ cancelDate }} — Pro access until then.
        </p>
        <p
          v-else-if="isPro && renewalDate"
          class="font-fell text-sm text-muted-foreground italic"
        >
          Renews {{ renewalDate }}
        </p>
        <p
          v-else-if="subscription?.status === 'past_due'"
          class="font-fell text-sm text-red-400 italic"
        >
          Payment failed — update your payment method to restore access.
        </p>
        <p
          v-else-if="subscription?.status === 'cancelled'"
          class="font-fell text-sm text-muted-foreground italic"
        >
          Your Pro subscription has ended.
        </p>

        <!-- Pre-downgrade impact warning — shown when cancellation is pending + user is over free quotas -->
        <div
          v-if="isPendingCancellation && downgradeImpact.length > 0"
          class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-1"
        >
          <p class="font-cinzel text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
            On cancellation
          </p>
          <ul class="space-y-0.5">
            <li
              v-for="item in downgradeImpact"
              :key="item.label"
              class="font-fell text-xs text-muted-foreground italic"
            >
              {{ item.label }}: {{ item.current }} → limit {{ item.limit }} ({{ item.excess }} will be locked)
            </li>
          </ul>
          <p class="font-fell text-[11px] text-muted-foreground italic">
            Content over your free limits will be locked, not deleted. Upgrade to restore access.
          </p>
        </div>

        <!-- Manage billing — only once a Stripe customer exists -->
        <button
          v-if="subscription?.stripe_customer_id"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm font-cinzel font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-60"
          :disabled="stripeLoading"
          @click="openBillingPortal()"
        >
          <IconLoading v-if="stripeLoading" class="h-3.5 w-3.5 animate-spin" />
          <IconBilling v-else class="h-3.5 w-3.5" />
          Manage billing
        </button>
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
          class="font-cinzel text-[11px] font-semibold tracking-[0.2em] text-amber-400 uppercase mb-1"
        >
          Upgrade to Pro
        </p>
        <h2 class="font-cinzel text-xl font-bold text-amber-400">
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
                class="h-3.5 w-3.5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5 text-[8px] text-muted-foreground font-bold"
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
                class="h-3.5 w-3.5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5 text-[8px] text-amber-400 font-bold"
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
          class="font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="
            !annual
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="annual = false"
        >
          Monthly
        </button>
        <button
          class="relative inline-flex h-5 w-9 items-center rounded-full border transition-colors"
          :class="
            annual ? 'bg-amber-500 border-amber-500' : 'bg-muted border-border'
          "
          @click="annual = !annual"
        >
          <span
            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
            :class="annual ? 'translate-x-4.5' : 'translate-x-0.5'"
          />
        </button>
        <button
          class="font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="
            annual
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="annual = true"
        >
          Annual
          <span class="ml-1 text-[10px] text-amber-400">save 4 months</span>
        </button>
      </div>

      <div class="flex items-end gap-2">
        <span class="font-cinzel text-3xl font-bold text-amber-400">{{
          annual ? "€99" : "€12.99"
        }}</span>
        <span class="font-fell text-sm text-muted-foreground italic mb-1">{{
          annual ? "/ year" : "/ month"
        }}</span>
      </div>

      <button
        class="w-full py-2.5 rounded-md bg-amber-500 text-black font-cinzel text-xs font-semibold tracking-wider hover:bg-amber-400 transition-colors disabled:opacity-60"
        :disabled="stripeLoading"
        @click="createCheckoutSession(annual ? 'year' : 'month')"
      >
        <IconLoading
          v-if="stripeLoading"
          class="inline h-3.5 w-3.5 animate-spin mr-1.5"
        />
        {{
          stripeLoading
            ? "Redirecting…"
            : annual
              ? "Upgrade — €99/year"
              : "Upgrade — €12.99/month"
        }}
      </button>

      <p class="font-fell text-xs text-muted-foreground italic text-center">
        Cancel anytime from the billing portal. No hidden fees.
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
        <span v-else class="font-cinzel text-lg font-bold text-primary">
          {{ formattedBalance }}
        </span>
      </div>

      <p class="font-fell text-xs text-muted-foreground italic leading-relaxed">
        Pro subscribers receive 5 credits each billing period. Use credits to
        generate NPC portraits (2 credits), text descriptions (1 credit), and
        monster stat blocks (1 credit).
      </p>

      <!-- Credit pack purchase -->
      <div class="space-y-2">
        <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Buy more credits
        </p>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="pack in creditPacks"
            :key="pack.pack_id"
            class="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/30 p-3 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="purchaseLoading"
            @click="purchasePack(pack.pack_id)"
          >
            <span class="font-cinzel text-xs font-bold text-foreground">{{ pack.credits }} credits</span>
            <span class="font-fell text-[11px] italic text-muted-foreground">€{{ pack.eur_display }}</span>
            <span class="font-cinzel text-[9px] tracking-wider text-muted-foreground/70 uppercase">{{ pack.label }}</span>
          </button>
        </div>
        <p v-if="purchaseError" class="font-fell text-xs text-red-400 italic">
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
import { useSubscription } from "@/composables/useSubscription";
import { useStripe } from "@/composables/useStripe";
import { useAiCredits } from "@/composables/useAiCredits";
import { usePlan } from "@/composables/usePlan";
import { useQuota } from "@/composables/useQuota";
import { QUOTA_RESOURCE_LABELS } from "@/types/subscription.types";
import type { QuotaResource } from "@/types/subscription.types";
import { useCreditPacks } from "@/composables/useCreditConfig";

const route = useRoute();
const creditPurchaseSuccess = computed(() => route.query.credit_purchase === "success");

const { subscription, isPro, isPendingCancellation, isLoading } = useSubscription();
const {
  loading: stripeLoading,
  createCheckoutSession,
  openBillingPortal,
} = useStripe();
const {
  formattedBalance,
  isLoading: creditsLoading,
  purchasePack,
  purchaseLoading,
  purchaseError,
} = useAiCredits();

const { data: creditPacks } = useCreditPacks();

const { data: freePlan } = usePlan("free");

const annual = ref(false);

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

// Pre-downgrade impact: which resources are currently over the free-plan limit
const QUOTA_RESOURCES: QuotaResource[] = [
  "campaigns", "npcs", "monsters", "encounters", "scriptorium_documents", "notes",
]
const quotaResults = Object.fromEntries(
  QUOTA_RESOURCES.map(r => [r, useQuota(r)])
) as Record<QuotaResource, ReturnType<typeof useQuota>>

const downgradeImpact = computed(() => {
  const freeQuotas = freePlan.value?.quotas ?? {}
  return QUOTA_RESOURCES.flatMap(r => {
    const limit = freeQuotas[r]
    if (limit === null || limit === undefined) return []
    const current = quotaResults[r].quota.value?.current ?? 0
    if (current <= limit) return []
    return [{ label: QUOTA_RESOURCE_LABELS[r], current, limit, excess: current - limit }]
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

const proFeatures = [
  "Unlimited campaigns & content",
  "5 AI credits / month",
  "Full player portal",
  "No player fees — ever",
]
</script>
