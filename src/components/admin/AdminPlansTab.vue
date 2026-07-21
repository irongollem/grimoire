<template>
  <div class="space-y-6">
    <div
      v-if="plansQuery.isPending.value"
      class="text-muted-foreground font-fell text-sm"
    >
      Loading plans…
    </div>
    <div
      v-else-if="plansQuery.isError.value"
      class="text-destructive font-fell text-sm"
    >
      Failed to load plans.
    </div>
    <template v-else>
      <div
        v-for="plan in plansQuery.data.value"
        :key="plan.id"
        class="rounded-lg border border-border bg-card p-4 space-y-4"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2
              class="font-cinzel text-sm font-semibold tracking-wide text-foreground capitalize"
            >
              {{ plan.name }}
            </h2>
            <span
              class="font-cinzel text-2xs tracking-widest text-muted-foreground uppercase"
            >
              {{ plan.id }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span
              v-if="plan.id !== 'free'"
              class="font-cinzel text-xs font-semibold tracking-wider text-amber-400 border border-amber-400/40 px-2 py-0.5 rounded"
            >
              Unlimited
            </span>
            <button
              class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              :disabled="planSaving[plan.id]"
              @click="savePlan(plan)"
            >
              {{ planSaving[plan.id] ? "Saving…" : "Save" }}
            </button>
          </div>
        </div>

        <!-- Monthly included AI credits — configurable on every plan -->
        <div class="rounded-md bg-muted/40 border border-border p-3 space-y-1">
          <label
            class="block text-eyebrow font-semibold text-muted-foreground"
          >
            Monthly Included Credits
          </label>
          <div class="flex items-center gap-3">
            <input
              v-model.number="draftMonthlyCredits[plan.id]"
              type="number"
              min="0"
              class="w-32 bg-background border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p class="font-fell text-[0.6875rem] text-muted-foreground italic">
              {{ creditsHelper(draftMonthlyCredits[plan.id]) }}
            </p>
          </div>
          <p class="font-fell text-2xs text-muted-foreground/60 italic">
            Use-it-or-lose-it allowance granted each billing period. Resets
            monthly; purchased packs are separate and permanent.
          </p>
        </div>

        <!-- Free plan: editable quota inputs -->
        <div
          v-if="plan.id === 'free'"
          class="grid grid-cols-2 md:grid-cols-3 gap-3"
        >
          <div
            v-for="resource in QUOTA_RESOURCES"
            :key="resource"
            class="space-y-1"
          >
            <label
              class="block text-eyebrow font-semibold text-muted-foreground"
            >
              {{ LABELS[resource] }}
            </label>
            <input
              v-model.number="draftQuotas[plan.id][resource]"
              type="number"
              min="0"
              class="w-full bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <!-- Tester / Pro: read-only ∞ grid -->
        <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div
            v-for="resource in QUOTA_RESOURCES"
            :key="resource"
            class="space-y-1"
          >
            <p
              class="text-eyebrow font-semibold text-muted-foreground"
            >
              {{ LABELS[resource] }}
            </p>
            <p class="font-fell text-sm text-foreground">∞</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Subscription prices -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h2
          class="font-cinzel text-sm font-semibold tracking-wide text-foreground"
        >
          Subscription Prices
        </h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
          Enter Stripe Price IDs for each paid plan and click Sync — amounts are
          fetched from Stripe and cached.
        </p>
      </div>
      <div
        v-if="plansQuery.isPending.value"
        class="text-muted-foreground font-fell text-sm"
      >
        Loading…
      </div>
      <div
        v-else-if="plansQuery.isError.value"
        class="text-destructive font-fell text-sm"
      >
        Failed to load plans.
      </div>
      <template v-else>
        <div
          v-for="plan in (plansQuery.data.value ?? []).filter(
            (p) => p.id !== 'free',
          )"
          :key="plan.id"
          class="border border-border rounded-md p-3 space-y-3"
        >
          <div class="flex items-center justify-between">
            <h3
              class="font-cinzel text-xs font-semibold tracking-wide text-foreground capitalize"
            >
              {{ plan.name }}
            </h3>
            <button
              class="px-2.5 py-1 font-cinzel text-2xs font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
              :disabled="planPriceSyncing[plan.id]"
              @click="syncPlanPrices(plan.id)"
            >
              {{ planPriceSyncing[plan.id] ? "Saving…" : "Save" }}
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label
                class="block text-eyebrow text-muted-foreground"
                >Monthly Price ID</label
              >
              <div class="flex items-center gap-2">
                <input
                  v-model="draftPlanPrices[plan.id].monthlyPriceId"
                  type="text"
                  placeholder="price_…"
                  class="flex-1 bg-muted border border-border rounded px-2 py-1 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  :class="
                    draftPlanPrices[plan.id].monthlyPriceId
                      ? 'text-green-400'
                      : 'text-amber-400'
                  "
                />
                <span
                  v-if="plan.stripe_monthly_unit_amount && plan.stripe_currency"
                  class="font-fell text-xs text-muted-foreground whitespace-nowrap"
                >
                  {{
                    new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: plan.stripe_currency.toUpperCase(),
                    }).format(plan.stripe_monthly_unit_amount / 100)
                  }}/mo
                </span>
              </div>
            </div>
            <div class="space-y-1">
              <label
                class="block text-eyebrow text-muted-foreground"
                >Annual Price ID</label
              >
              <div class="flex items-center gap-2">
                <input
                  v-model="draftPlanPrices[plan.id].annualPriceId"
                  type="text"
                  placeholder="price_…"
                  class="flex-1 bg-muted border border-border rounded px-2 py-1 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  :class="
                    draftPlanPrices[plan.id].annualPriceId
                      ? 'text-green-400'
                      : 'text-amber-400'
                  "
                />
                <span
                  v-if="plan.stripe_annual_unit_amount && plan.stripe_currency"
                  class="font-fell text-xs text-muted-foreground whitespace-nowrap"
                >
                  {{
                    new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: plan.stripe_currency.toUpperCase(),
                    }).format(plan.stripe_annual_unit_amount / 100)
                  }}/yr
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import { useAdminPlans } from "@/composables/useAdminPlans";
import { useGenerationCreditCosts } from "@/composables/useCreditConfig";
import { sizeMultiplier } from "@/composables/useAiCredits";
import { QUOTA_RESOURCES } from "@/types/subscription.types";
import type { Plan, QuotaResource } from "@/types/subscription.types";

const {
  LABELS,
  updateQuotas,
  updateMonthlyCredits,
  syncPlanPrices: syncPlanPricesMutation,
  ...plansQuery
} = useAdminPlans();

// Credits → "≈ N portraits" helper, using the live entity_image cost × portrait area.
const { data: generationCosts } = useGenerationCreditCosts();
function creditsHelper(credits: number | undefined): string {
  if (!credits || credits <= 0) return "No included credits";
  const base =
    generationCosts.value?.find((r) => r.generation_type === "entity_image")
      ?.credit_cost ?? 50;
  const perPortrait = base * sizeMultiplier("1024x1536");
  const portraits = Math.floor(credits / perPortrait);
  return `≈ ${portraits} portrait image${portraits === 1 ? "" : "s"} / month (or ${credits} text gens)`;
}

type QuotaDraft = Record<string, Record<QuotaResource, number>>;
const draftQuotas = reactive<QuotaDraft>({});
const draftMonthlyCredits = reactive<Record<string, number>>({});
const planSaving = reactive<Record<string, boolean>>({});

watch(
  () => plansQuery.data.value,
  (plans) => {
    if (!plans) return;
    for (const plan of plans) {
      if (plan.id === "free") {
        draftQuotas[plan.id] = {
          ...defaultQuotaRecord(),
          ...plan.quotas,
        } as Record<QuotaResource, number>;
      }
      if (!(plan.id in draftMonthlyCredits)) {
        draftMonthlyCredits[plan.id] = plan.monthly_credits ?? 0;
      }
    }
  },
  { immediate: true },
);

function defaultQuotaRecord(): Record<QuotaResource, number> {
  return {
    campaigns: 0,
    npcs: 0,
    monsters: 0,
    encounters: 0,
    scriptorium_documents: 0,
    notes: 0,
    sounds: 0,
    soundboard_pages: 0,
    soundboard_playlists: 0,
    quests: 0,
    factions: 0,
    locations: 0,
    deities: 0,
    pantheons: 0,
    puzzle_rooms: 0,
  };
}

async function savePlan(plan: Plan) {
  planSaving[plan.id] = true;
  try {
    // Quotas are only editable on Free; monthly credits are configurable on every plan.
    if (plan.id === "free") {
      await updateQuotas.mutateAsync({
        planId: plan.id,
        quotas: draftQuotas[plan.id],
      });
    }
    await updateMonthlyCredits.mutateAsync({
      planId: plan.id,
      monthlyCredits: draftMonthlyCredits[plan.id] ?? 0,
    });
  } finally {
    planSaving[plan.id] = false;
  }
}

type PlanPriceDraft = { monthlyPriceId: string; annualPriceId: string };
const draftPlanPrices = reactive<Record<string, PlanPriceDraft>>({});
const planPriceSyncing = reactive<Record<string, boolean>>({});

watch(
  () => plansQuery.data.value,
  (plans) => {
    if (!plans) return;
    for (const plan of plans) {
      if (plan.id !== "free" && !(plan.id in draftPlanPrices)) {
        draftPlanPrices[plan.id] = {
          monthlyPriceId: plan.stripe_price_id ?? "",
          annualPriceId: plan.stripe_annual_price_id ?? "",
        };
      }
    }
  },
  { immediate: true },
);

async function syncPlanPrices(planId: string) {
  planPriceSyncing[planId] = true;
  const draft = draftPlanPrices[planId];
  try {
    await syncPlanPricesMutation.mutateAsync({
      planId,
      monthlyPriceId: draft.monthlyPriceId.trim() || undefined,
      annualPriceId: draft.annualPriceId.trim() || undefined,
    });
  } finally {
    planPriceSyncing[planId] = false;
  }
}
</script>
