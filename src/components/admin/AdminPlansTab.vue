<template>
  <div class="space-y-6">
    <div v-if="plansQuery.isPending.value" class="text-muted-foreground font-fell text-sm">
      Loading plans…
    </div>
    <div v-else-if="plansQuery.isError.value" class="text-destructive font-fell text-sm">
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
            <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground capitalize">
              {{ plan.name }}
            </h2>
            <span class="font-cinzel text-[10px] tracking-widest text-muted-foreground uppercase">
              {{ plan.id }}
            </span>
          </div>
          <span
            v-if="plan.id !== 'free'"
            class="font-cinzel text-xs font-semibold tracking-wider text-amber-400 border border-amber-400/40 px-2 py-0.5 rounded"
          >
            Unlimited
          </span>
          <button
            v-else
            class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            :disabled="planSaving[plan.id]"
            @click="savePlanQuotas(plan)"
          >
            {{ planSaving[plan.id] ? 'Saving…' : 'Save' }}
          </button>
        </div>

        <!-- Free plan: editable quota inputs -->
        <div v-if="plan.id === 'free'" class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div v-for="resource in QUOTA_RESOURCES" :key="resource" class="space-y-1">
            <label class="block font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
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
          <div v-for="resource in QUOTA_RESOURCES" :key="resource" class="space-y-1">
            <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
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
        <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Subscription Prices</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
          Enter Stripe Price IDs for each paid plan and click Sync — amounts are fetched from Stripe and cached.
        </p>
      </div>
      <div v-if="plansQuery.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
      <div v-else-if="plansQuery.isError.value" class="text-destructive font-fell text-sm">Failed to load plans.</div>
      <template v-else>
        <div
          v-for="plan in (plansQuery.data.value ?? []).filter(p => p.id !== 'free')"
          :key="plan.id"
          class="border border-border rounded-md p-3 space-y-3"
        >
          <div class="flex items-center justify-between">
            <h3 class="font-cinzel text-xs font-semibold tracking-wide text-foreground capitalize">{{ plan.name }}</h3>
            <button
              class="px-2.5 py-1 font-cinzel text-[10px] font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
              :disabled="planPriceSyncing[plan.id]"
              @click="syncPlanPrices(plan.id)"
            >
              {{ planPriceSyncing[plan.id] ? 'Saving…' : 'Save' }}
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Monthly Price ID</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="draftPlanPrices[plan.id].monthlyPriceId"
                  type="text"
                  placeholder="price_…"
                  class="flex-1 bg-muted border border-border rounded px-2 py-1 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  :class="draftPlanPrices[plan.id].monthlyPriceId ? 'text-green-400' : 'text-amber-400'"
                />
                <span v-if="plan.stripe_monthly_unit_amount && plan.stripe_currency" class="font-fell text-xs text-muted-foreground whitespace-nowrap">
                  {{ new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.stripe_currency.toUpperCase() }).format(plan.stripe_monthly_unit_amount / 100) }}/mo
                </span>
              </div>
            </div>
            <div class="space-y-1">
              <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Annual Price ID</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="draftPlanPrices[plan.id].annualPriceId"
                  type="text"
                  placeholder="price_…"
                  class="flex-1 bg-muted border border-border rounded px-2 py-1 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  :class="draftPlanPrices[plan.id].annualPriceId ? 'text-green-400' : 'text-amber-400'"
                />
                <span v-if="plan.stripe_annual_unit_amount && plan.stripe_currency" class="font-fell text-xs text-muted-foreground whitespace-nowrap">
                  {{ new Intl.NumberFormat(undefined, { style: 'currency', currency: plan.stripe_currency.toUpperCase() }).format(plan.stripe_annual_unit_amount / 100) }}/yr
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
import type { Plan, QuotaResource } from "@/types/subscription.types";

const { LABELS, updateQuotas, syncPlanPrices: syncPlanPricesMutation, ...plansQuery } = useAdminPlans();

const QUOTA_RESOURCES: QuotaResource[] = [
  "campaigns",
  "npcs",
  "monsters",
  "encounters",
  "scriptorium_documents",
  "notes",
];

type QuotaDraft = Record<string, Record<QuotaResource, number>>;
const draftQuotas = reactive<QuotaDraft>({});
const planSaving = reactive<Record<string, boolean>>({});

watch(
  () => plansQuery.data.value,
  (plans) => {
    if (!plans) return;
    for (const plan of plans) {
      if (plan.id === "free") {
        draftQuotas[plan.id] = { ...defaultQuotaRecord(), ...plan.quotas } as Record<QuotaResource, number>;
      }
    }
  },
  { immediate: true },
);

function defaultQuotaRecord(): Record<QuotaResource, number> {
  return { campaigns: 0, npcs: 0, monsters: 0, encounters: 0, scriptorium_documents: 0, notes: 0 };
}

async function savePlanQuotas(plan: Plan) {
  planSaving[plan.id] = true;
  try {
    await updateQuotas.mutateAsync({ planId: plan.id, quotas: draftQuotas[plan.id] });
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
