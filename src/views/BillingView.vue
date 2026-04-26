<template>
  <div class="max-w-2xl mx-auto px-4 py-8 space-y-6">
    <PageHeader title="Billing & Subscription" />

    <!-- Current plan card -->
    <div class="rounded-xl border bg-card p-6 space-y-4">
      <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Current plan</h2>

      <div v-if="isLoading" class="flex items-center gap-2 text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        <span class="font-fell text-sm italic">Loading…</span>
      </div>

      <template v-else>
        <div class="flex items-center gap-3">
          <Crown v-if="isPro" class="h-5 w-5 text-amber-400 shrink-0" />
          <Scroll v-else class="h-5 w-5 text-muted-foreground shrink-0" />
          <span class="font-cinzel text-lg font-bold" :class="isPro ? 'text-amber-400' : 'text-foreground'">
            {{ isPro ? 'Pro DM' : 'Free DM' }}
          </span>
          <span
            v-if="subscription"
            class="ml-1 px-2 py-0.5 rounded-full font-cinzel text-[10px] font-semibold tracking-wider uppercase"
            :class="statusClass"
          >
            {{ subscription.status }}
          </span>
        </div>

        <p v-if="isPro && renewalDate" class="font-fell text-sm text-muted-foreground italic">
          Renews {{ renewalDate }}
        </p>
        <p v-else-if="subscription?.status === 'past_due'" class="font-fell text-sm text-red-400 italic">
          Payment failed — update your payment method to restore access.
        </p>
        <p v-else-if="subscription?.status === 'canceled'" class="font-fell text-sm text-muted-foreground italic">
          Your Pro subscription has ended.
        </p>

        <!-- Manage billing — only once a Stripe customer exists -->
        <button
          v-if="subscription?.stripe_customer_id"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm font-cinzel font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-60"
          :disabled="stripeLoading"
          @click="openBillingPortal()"
        >
          <Loader2 v-if="stripeLoading" class="h-3.5 w-3.5 animate-spin" />
          <CreditCard v-else class="h-3.5 w-3.5" />
          Manage billing
        </button>
      </template>
    </div>

    <!-- Upgrade CTA (free / lapsed users) -->
    <div
      v-if="!isLoading && !isPro"
      class="rounded-xl border border-amber-500/30 bg-amber-500/5 relative overflow-hidden p-6 space-y-5"
    >
      <div class="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-400/50 to-transparent" />

      <div>
        <p class="font-cinzel text-[11px] font-semibold tracking-[0.2em] text-amber-400 uppercase mb-1">
          Upgrade to Pro
        </p>
        <h2 class="font-cinzel text-xl font-bold text-amber-400">Unlock your full legend</h2>
      </div>

      <!-- Feature comparison -->
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p class="font-cinzel font-semibold text-muted-foreground mb-2 tracking-wide">Free</p>
          <ul class="space-y-1.5">
            <li v-for="item in freeFeatures" :key="item" class="flex items-start gap-2">
              <span class="h-3.5 w-3.5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5 text-[8px] text-muted-foreground font-bold">✓</span>
              <span class="font-fell italic text-muted-foreground leading-tight">{{ item }}</span>
            </li>
          </ul>
        </div>
        <div>
          <p class="font-cinzel font-semibold text-amber-400 mb-2 tracking-wide">Pro</p>
          <ul class="space-y-1.5">
            <li v-for="item in proFeatures" :key="item" class="flex items-start gap-2">
              <span class="h-3.5 w-3.5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5 text-[8px] text-amber-400 font-bold">✓</span>
              <span class="font-fell italic text-muted-foreground leading-tight">{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Billing toggle -->
      <div class="flex items-center gap-3">
        <button
          class="font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="!annual ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="annual = false"
        >
          Monthly
        </button>
        <button
          class="relative inline-flex h-5 w-9 items-center rounded-full border transition-colors"
          :class="annual ? 'bg-amber-500 border-amber-500' : 'bg-muted border-border'"
          @click="annual = !annual"
        >
          <span
            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
            :class="annual ? 'translate-x-[18px]' : 'translate-x-0.5'"
          />
        </button>
        <button
          class="font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="annual ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="annual = true"
        >
          Annual
          <span class="ml-1 text-[10px] text-amber-400">save 4 months</span>
        </button>
      </div>

      <div class="flex items-end gap-2">
        <span class="font-cinzel text-3xl font-bold text-amber-400">{{ annual ? '€99' : '€12.99' }}</span>
        <span class="font-fell text-sm text-muted-foreground italic mb-1">{{ annual ? '/ year' : '/ month' }}</span>
      </div>

      <button
        class="w-full py-2.5 rounded-md bg-amber-500 text-black font-cinzel text-xs font-semibold tracking-wider hover:bg-amber-400 transition-colors disabled:opacity-60"
        :disabled="stripeLoading"
        @click="createCheckoutSession(annual ? 'year' : 'month')"
      >
        <Loader2 v-if="stripeLoading" class="inline h-3.5 w-3.5 animate-spin mr-1.5" />
        {{ stripeLoading ? 'Redirecting…' : (annual ? 'Upgrade — €99/year' : 'Upgrade — €12.99/month') }}
      </button>

      <p class="font-fell text-xs text-muted-foreground italic text-center">
        Cancel anytime from the billing portal. No hidden fees.
      </p>
    </div>

    <!-- AI credits (placeholder until #289) -->
    <div class="rounded-xl border border-border bg-card p-6 space-y-3 opacity-60">
      <div class="flex items-center gap-2">
        <Sparkles class="h-4 w-4 text-primary shrink-0" />
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">AI credits</h2>
        <span class="px-2 py-0.5 rounded-full bg-muted font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Coming soon</span>
      </div>
      <p class="font-fell text-sm text-muted-foreground italic leading-relaxed">
        Pro includes 5 AI credits per month for generating NPCs, monsters, spells, items, and artwork.
        Additional credit packs will be available for purchase.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Crown, CreditCard, Loader2, Scroll, Sparkles } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import { useSubscription } from "@/composables/useSubscription";
import { useStripe } from "@/composables/useStripe";

const { subscription, isPro, isLoading } = useSubscription();
const { loading: stripeLoading, createCheckoutSession, openBillingPortal } = useStripe();

const annual = ref(false);

const renewalDate = computed(() => {
  const end = subscription.value?.current_period_end;
  if (!end) return null;
  return new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
});

const statusClass = computed(() => {
  switch (subscription.value?.status) {
    case "active":    return "bg-green-500/15 text-green-400";
    case "trialing":  return "bg-blue-500/15 text-blue-400";
    case "past_due":  return "bg-orange-500/15 text-orange-400";
    case "canceled":  return "bg-muted text-muted-foreground";
    default:          return "bg-muted text-muted-foreground";
  }
});

const freeFeatures = [
  "All DM tools",
  "Up to 3 campaigns",
  "Full player portal",
  "No player fees",
];

const proFeatures = [
  "Unlimited campaigns & content",
  "5 AI credits / month",
  "Full player portal",
  "No player fees — ever",
];
</script>
