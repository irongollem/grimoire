<template>
  <div class="min-h-screen">
    <!-- Top nav -->
    <nav class="flex items-center justify-between px-6 py-4 border-b border-border/40 max-w-5xl mx-auto">
      <RouterLink
        to="/"
        class="flex items-center gap-1.5 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <span class="text-base leading-none">←</span>
        <span>Home</span>
      </RouterLink>
      <div class="flex items-center gap-3">
        <RouterLink
          to="/login"
          class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign In
        </RouterLink>
        <RouterLink
          to="/signup"
          class="font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
        >
          Get Started
        </RouterLink>
      </div>
    </nav>

    <!-- Hero -->
    <section class="text-center pt-14 pb-8 px-4">
      <p class="font-cinzel text-[11px] font-semibold tracking-[0.25em] text-amber-400 uppercase mb-3">
        Choose Your Path
      </p>
      <h1 class="font-cinzel text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
        Power Your Campaign
      </h1>
      <p class="font-fell text-lg text-muted-foreground italic max-w-md mx-auto leading-relaxed">
        Every great story begins with the right tools. Start free — upgrade when your legend demands it.
      </p>
    </section>

    <!-- Billing toggle + currency selector -->
    <div class="flex flex-col items-center gap-3 mb-10">
    <div class="flex items-center gap-3">
      <button
        class="font-cinzel text-xs font-semibold tracking-wider transition-colors"
        :class="!annual ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="annual = false"
      >
        Monthly
      </button>
      <button
        role="switch"
        :aria-checked="annual"
        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors"
        :class="annual ? 'bg-amber-500/30 border-amber-500/40' : 'bg-muted'"
        @click="annual = !annual"
      >
        <span
          class="pointer-events-none inline-block h-4 w-4 rounded-full shadow-sm transition-all mt-0.5"
          :class="annual ? 'translate-x-4 bg-amber-400' : 'translate-x-0.5 bg-muted-foreground'"
        />
      </button>
      <button
        class="font-cinzel text-xs font-semibold tracking-wider transition-colors flex items-center gap-1.5"
        :class="annual ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="annual = true"
      >
        Annual
        <span
          v-if="savedMonths > 0"
          class="bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-px font-cinzel text-[10px] tracking-wider"
        >
          Save {{ savedMonths }} months
        </span>
      </button>
    </div>
    <div v-if="planCurrencies.length > 1" class="flex gap-1">
      <button
        v-for="c in planCurrencies"
        :key="c"
        class="px-2 py-0.5 font-cinzel text-[10px] tracking-wider rounded border transition-colors"
        :class="currency === c ? 'border-primary/60 text-foreground bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'"
        @click="currency = c"
      >{{ c }}</button>
    </div>
    </div>

    <!-- Plan cards -->
    <div class="max-w-3xl mx-auto px-4 pb-16">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">

        <!-- Free plan -->
        <div class="rounded-xl border border-border bg-card p-6 flex flex-col">
          <div class="mb-5">
            <p class="font-cinzel text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase mb-2">
              Free DM
            </p>
            <div class="flex items-end gap-2 mb-1">
              <span class="font-cinzel text-3xl font-bold text-foreground">Free</span>
              <span class="font-fell text-sm text-muted-foreground italic mb-1">— forever</span>
            </div>
            <p class="font-fell text-sm text-muted-foreground italic leading-snug">
              Everything you need to start your first adventure.
            </p>
          </div>

          <ul class="space-y-2.5 flex-1 mb-6">
            <li
              v-for="row in featureRows"
              :key="row.key"
              class="flex items-center gap-2.5"
            >
              <span
                class="h-4 w-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold"
                :class="row.freeAvail ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground/40'"
              >
                {{ row.freeAvail ? '✓' : '—' }}
              </span>
              <span class="font-fell text-sm text-muted-foreground flex-1 leading-tight">{{ row.label }}</span>
              <span
                class="font-cinzel text-xs font-semibold"
                :class="row.freeAvail ? 'text-foreground' : 'text-muted-foreground/40'"
              >
                {{ row.freeText }}
              </span>
            </li>
          </ul>

          <RouterLink
            to="/signup"
            class="w-full block text-center px-4 py-2.5 font-cinzel text-xs font-semibold tracking-wider border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Start Free
          </RouterLink>
        </div>

        <!-- Pro plan -->
        <div class="rounded-xl border border-amber-500/30 bg-card p-6 flex flex-col relative overflow-hidden">
          <div class="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-400/50 to-transparent" />

          <div class="mb-5">
            <div class="flex items-center justify-between mb-2">
              <p class="font-cinzel text-[11px] font-semibold tracking-[0.15em] text-amber-400 uppercase">
                Pro DM
              </p>
              <span class="font-cinzel text-[10px] font-semibold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5">
                Most Popular
              </span>
            </div>

            <template v-if="displayMonthlyPrice">
              <div class="flex items-end gap-2 mb-0.5">
                <span class="font-cinzel text-3xl font-bold text-amber-400">{{ displayMonthlyPrice }}</span>
                <span class="font-fell text-sm text-muted-foreground italic mb-1">/ mo</span>
              </div>
              <p v-if="annual && displayAnnualTotal" class="font-fell text-xs text-muted-foreground italic">
                {{ displayAnnualTotal }} billed annually
              </p>
            </template>

            <p class="font-fell text-sm text-muted-foreground italic leading-snug mt-2">
              Unlimited access to every tool in the grimoire.
            </p>
          </div>

          <ul class="space-y-2.5 flex-1 mb-6">
            <li
              v-for="row in featureRows"
              :key="row.key"
              class="flex items-center gap-2.5"
            >
              <span
                class="h-4 w-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold"
                :class="row.proAvail ? 'bg-amber-500/15 text-amber-400' : 'bg-muted text-muted-foreground/40'"
              >
                {{ row.proAvail ? '✓' : '—' }}
              </span>
              <span class="font-fell text-sm text-muted-foreground flex-1 leading-tight">{{ row.label }}</span>
              <span
                class="font-cinzel text-xs font-semibold"
                :class="row.proAvail ? 'text-amber-400' : 'text-muted-foreground/40'"
              >
                {{ row.proText }}
              </span>
            </li>
          </ul>

          <RouterLink
            to="/signup"
            class="w-full block text-center px-4 py-2.5 font-cinzel text-xs font-semibold tracking-wider bg-amber-500 text-black rounded-md hover:bg-amber-400 transition-colors"
          >
            Get Pro
          </RouterLink>
        </div>
      </div>

      <p class="text-center font-fell text-sm text-muted-foreground italic mt-8">
        Already have an account?
        <RouterLink to="/login" class="text-foreground hover:underline underline-offset-2">Sign in</RouterLink>
        · Players always join and play for free.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useHead } from "@unhead/vue";
import { usePlan } from "@/composables/usePlan";

useHead({
  title: "Pricing — Grimoire D&D Campaign Manager",
  meta: [
    { name: "description", content: "Free tier for Dungeon Masters plus a Pro plan with unlimited campaigns, NPCs, monsters, and 5 AI credits per month. Players always join and play for free." },
    { property: "og:title", content: "Pricing — Grimoire" },
    { property: "og:description", content: "Free tier for DMs + Pro plan with unlimited content and AI credits. Players always free." },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://dungeongrimoire.com/pricing" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: "Pricing — Grimoire" },
    { name: "twitter:description", content: "Free tier for DMs + Pro plan with unlimited content and AI credits. Players always free." },
  ],
  link: [{ rel: "canonical", href: "https://dungeongrimoire.com/pricing" }],
});
import { QUOTA_RESOURCE_LABELS } from "@/types/subscription.types";
import type { QuotaResource } from "@/types/subscription.types";
import { detectCurrency, formatCents, resolveAmount, availableCurrencies } from "@/lib/pricing";

const annual = ref(false);

const { data: freePlan } = usePlan("free");
const { data: proPlan } = usePlan("pro");

const currency = ref(detectCurrency());

const planCurrencies = computed(() =>
  availableCurrencies(
    proPlan.value?.stripe_currency,
    proPlan.value?.stripe_monthly_currency_options,
    proPlan.value?.stripe_annual_currency_options,
  )
);

const monthlyResolved = computed(() =>
  resolveAmount(
    proPlan.value?.stripe_monthly_unit_amount,
    proPlan.value?.stripe_currency,
    proPlan.value?.stripe_monthly_currency_options,
    currency.value,
  )
);

const annualResolved = computed(() =>
  resolveAmount(
    proPlan.value?.stripe_annual_unit_amount,
    proPlan.value?.stripe_currency,
    proPlan.value?.stripe_annual_currency_options,
    currency.value,
  )
);

const displayMonthlyPrice = computed(() => {
  const r = monthlyResolved.value;
  if (!r) return null;
  const amount = annual.value ? Math.round(r.amount / 12) : r.amount;
  return formatCents(amount, r.currency);
});

const displayAnnualTotal = computed(() => {
  const r = annualResolved.value;
  return r ? formatCents(r.amount, r.currency) : null;
});

const savedMonths = computed(() => {
  const mo = monthlyResolved.value;
  const yr = annualResolved.value;
  if (!mo || !yr) return 0;
  return Math.round((mo.amount * 12 - yr.amount) / mo.amount);
});

const QUOTA_RESOURCES: QuotaResource[] = [
  "campaigns",
  "npcs",
  "monsters",
  "encounters",
  "scriptorium_documents",
  "notes",
];

const featureRows = computed(() => {
  const quotaRows = QUOTA_RESOURCES.map((r) => {
    const freeLimit = freePlan.value?.quotas?.[r];
    const proLimit = proPlan.value?.quotas?.[r];
    const freeText =
      freeLimit !== undefined && freeLimit !== null && freeLimit >= 0
        ? String(freeLimit)
        : "Unlimited";
    const proText =
      proLimit === undefined || proLimit === null || proLimit < 0
        ? "Unlimited"
        : String(proLimit);
    return {
      key: r,
      label: QUOTA_RESOURCE_LABELS[r],
      freeText,
      proText,
      freeAvail: freeText !== "—",
      proAvail: true,
    };
  });

  return [
    ...quotaRows,
    {
      key: "ai",
      label: "AI generation (NPCs, monsters, artwork…)",
      freeText: "—",
      proText: "✓",
      freeAvail: false,
      proAvail: true,
    },
    {
      key: "cardforge",
      label: "Card Forge (trading & Tarot cards)",
      freeText: "✓",
      proText: "✓",
      freeAvail: true,
      proAvail: true,
    },
    {
      key: "players",
      label: "Players play free",
      freeText: "✓",
      proText: "✓",
      freeAvail: true,
      proAvail: true,
    },
  ];
});
</script>
