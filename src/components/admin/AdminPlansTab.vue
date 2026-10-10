<template>
  <div class="space-y-6">
    <div
      v-if="plansQuery.isPending.value"
      class="text-muted-foreground text-body"
    >
      Loading plans…
    </div>
    <div
      v-else-if="plansQuery.isError.value"
      class="text-destructive text-body"
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
              class="text-heading-sm font-semibold text-foreground capitalize"
            >
              {{ plan.name }}
            </h2>
            <span
              class="text-eyebrow text-muted-foreground uppercase"
            >
              {{ plan.id }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span
              v-if="plan.id !== 'free'"
              class="text-label-lg font-semibold text-ink-caution border border-tone-caution/40 px-2 py-0.5 rounded"
            >
              Unlimited
            </span>
            <AppButton
              variant="primary"
              size="sm"
              :disabled="planSaving[plan.id]"
              @click="savePlan(plan)"
            >
              {{ planSaving[plan.id] ? "Saving…" : "Save" }}
            </AppButton>
          </div>
        </div>

        <DraftConflictNotice
          :fields="planConflictLabels(plan.id)"
          :on-discard="() => planDrafts.reset(plan.id)"
        />

        <!-- Monthly included AI credits — configurable on every plan -->
        <div class="rounded-md bg-muted/40 border border-border p-3 space-y-1">
          <label
            class="block text-eyebrow font-semibold text-muted-foreground"
          >
            Monthly Included Credits
          </label>
          <div class="flex items-center gap-3">
            <AppInput
              v-model.number="planDrafts.drafts[plan.id]!.monthlyCredits"
              type="number"
              min="0"
              size="body"
              :block="false"
              class="w-32"
            />
            <p class="text-caption text-muted-foreground italic">
              {{ creditsHelper(planDrafts.drafts[plan.id]?.monthlyCredits) }}
            </p>
          </div>
          <p class="text-caption-sm text-muted-foreground/60 italic">
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
            <AppInput
              v-model.number="planDrafts.drafts[plan.id]![quotaKey(resource)]"
              type="number"
              min="0"
              size="body"
              tone="filled"
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
            <p class="text-body text-foreground">∞</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Subscription prices -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h2
          class="text-heading-sm font-semibold text-foreground"
        >
          Subscription Prices
        </h2>
        <p class="text-caption text-muted-foreground italic mt-0.5">
          Enter Stripe Price IDs for each paid plan and click Sync; amounts are
          fetched from Stripe and cached.
        </p>
      </div>
      <div
        v-if="plansQuery.isPending.value"
        class="text-muted-foreground text-body"
      >
        Loading…
      </div>
      <div
        v-else-if="plansQuery.isError.value"
        class="text-destructive text-body"
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
              class="text-caption font-semibold text-foreground capitalize"
            >
              {{ plan.name }}
            </h3>
            <AppButton
              variant="primary"
              size="xs"
              :disabled="planPriceSyncing[plan.id]"
              @click="syncPlanPrices(plan.id)"
            >
              {{ planPriceSyncing[plan.id] ? "Saving…" : "Save" }}
            </AppButton>
          </div>
          <DraftConflictNotice
            :fields="priceConflictLabels(plan.id)"
            :on-discard="() => priceDrafts.reset(plan.id)"
          />
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label
                class="block text-eyebrow text-muted-foreground"
                >Monthly Price ID</label
              >
              <div class="flex items-center gap-2">
                <AppInput
                  v-model="priceDrafts.drafts[plan.id]!.monthlyPriceId"
                  type="text"
                  placeholder="price_…"
                  tone="filled"
                  size="body-xs"
                  :block="false"
                  :class="[
                    'flex-1 font-mono text-xs placeholder:text-muted-foreground/50',
                    priceDrafts.drafts[plan.id]!.monthlyPriceId
                      ? 'text-ink-success'
                      : 'text-ink-caution',
                  ]"
                />
                <span
                  v-if="plan.stripe_monthly_unit_amount && plan.stripe_currency"
                  class="text-caption text-muted-foreground whitespace-nowrap"
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
                <AppInput
                  v-model="priceDrafts.drafts[plan.id]!.annualPriceId"
                  type="text"
                  placeholder="price_…"
                  tone="filled"
                  size="body-xs"
                  :block="false"
                  :class="[
                    'flex-1 font-mono text-xs placeholder:text-muted-foreground/50',
                    priceDrafts.drafts[plan.id]!.annualPriceId
                      ? 'text-ink-success'
                      : 'text-ink-caution',
                  ]"
                />
                <span
                  v-if="plan.stripe_annual_unit_amount && plan.stripe_currency"
                  class="text-caption text-muted-foreground whitespace-nowrap"
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
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";
import { useKeyedRecordDrafts } from "@/composables/admin/useKeyedRecordDrafts";
import { useAdminPlans } from "@/composables/admin/useAdminPlans";
import { useGenerationCreditCosts } from "@/composables/billing/useCreditConfig";
import { sizeMultiplier } from "@/composables/ai/useAiCredits";
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

// Plans save per card, so each card is its own draft with its own server copy:
// a refetch reaches every field the admin has not touched, and saving one card
// never rebaselines another card's unsaved edits (#946). Quotas are flattened to
// one key each so editing one limit cannot hide a server change to another.
type QuotaKey = `quota_${QuotaResource}`;
type PlanDraft = { monthlyCredits: number } & Record<QuotaKey, number>;

function quotaKey(resource: QuotaResource): QuotaKey {
  return `quota_${resource}`;
}

function planToDraft(plan: Plan): PlanDraft {
  const quotas: Record<QuotaResource, number> = { ...defaultQuotaRecord(), ...plan.quotas };
  const flat = Object.fromEntries(QUOTA_RESOURCES.map((r) => [quotaKey(r), quotas[r]])) as Record<QuotaKey, number>;
  return { monthlyCredits: plan.monthly_credits, ...flat };
}

const planDrafts = useKeyedRecordDrafts<Plan, PlanDraft>(planToDraft);
const planSaving = reactive<Record<string, boolean>>({});

watch(
  () => plansQuery.data.value,
  (plans) => {
    if (!plans) return;
    for (const plan of plans) planDrafts.sync(plan.id, plan);
  },
  { immediate: true },
);

function planConflictLabels(planId: string): string[] {
  return (planDrafts.conflicts[planId] ?? []).map((key) =>
    key === "monthlyCredits" ? "Monthly Included Credits" : LABELS[key.slice("quota_".length) as QuotaResource],
  );
}

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
  const changed = planDrafts.changes(plan.id, (d) => d);
  const base = planDrafts.baseline(plan.id);
  if (!base || Object.keys(changed).length === 0) return;
  planSaving[plan.id] = true;
  try {
    // Quotas are only editable on Free; monthly credits are configurable on every plan.
    // The quotas column is one jsonb object, so the untouched limits in it come
    // from the latest server copy rather than from what the form was seeded with.
    const quotaChanged = QUOTA_RESOURCES.some((r) => quotaKey(r) in changed);
    if (plan.id === "free" && quotaChanged) {
      const quotas = Object.fromEntries(
        QUOTA_RESOURCES.map((r) => [r, changed[quotaKey(r)] ?? base[quotaKey(r)]]),
      ) as Record<QuotaResource, number>;
      await updateQuotas.mutateAsync({ planId: plan.id, quotas });
    }
    if (changed.monthlyCredits !== undefined) {
      await updateMonthlyCredits.mutateAsync({ planId: plan.id, monthlyCredits: changed.monthlyCredits });
    }
    planDrafts.commit(plan.id);
  } finally {
    planSaving[plan.id] = false;
  }
}

type PlanPriceDraft = { monthlyPriceId: string; annualPriceId: string };
const priceDrafts = useKeyedRecordDrafts<Plan, PlanPriceDraft>((plan) => ({
  monthlyPriceId: plan.stripe_price_id ?? "",
  annualPriceId: plan.stripe_annual_price_id ?? "",
}));
const planPriceSyncing = reactive<Record<string, boolean>>({});

watch(
  () => plansQuery.data.value,
  (plans) => {
    if (!plans) return;
    for (const plan of plans) {
      if (plan.id !== "free") priceDrafts.sync(plan.id, plan);
    }
  },
  { immediate: true },
);

function priceConflictLabels(planId: string): string[] {
  return (priceDrafts.conflicts[planId] ?? []).map((key) =>
    key === "monthlyPriceId" ? "Monthly Price ID" : "Annual Price ID",
  );
}

async function syncPlanPrices(planId: string) {
  const changed = priceDrafts.changes(planId, (d) => d);
  if (changed.monthlyPriceId === undefined && changed.annualPriceId === undefined) return;
  planPriceSyncing[planId] = true;
  try {
    await syncPlanPricesMutation.mutateAsync({
      planId,
      monthlyPriceId: changed.monthlyPriceId?.trim() || undefined,
      annualPriceId: changed.annualPriceId?.trim() || undefined,
    });
    priceDrafts.commit(planId);
  } finally {
    planPriceSyncing[planId] = false;
  }
}
</script>
