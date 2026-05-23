<template>
  <div class="space-y-6">
    <!-- Promo codes toggle -->
    <div class="rounded-lg border border-border bg-card p-4">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Promotion Codes</h2>
          <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
            When enabled, a promo code field appears on the Stripe checkout page. Disable when no active promotion is running so users don't wonder if they're missing out.
          </p>
        </div>
        <button
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none"
          :class="checkoutConfig.data.value?.promo_codes_enabled ? 'bg-primary' : 'bg-muted'"
          :disabled="checkoutConfig.update.isPending.value"
          @click="checkoutConfig.update.mutate(!checkoutConfig.data.value?.promo_codes_enabled)"
        >
          <span
            class="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
            :class="checkoutConfig.data.value?.promo_codes_enabled ? 'translate-x-5' : 'translate-x-0.5'"
          />
        </button>
      </div>
    </div>

    <!-- Credit packs -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Credit Packs</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
          Enter the Stripe Price ID and click Save — price data is fetched from Stripe and cached. Credits field controls how many credits the buyer receives.
        </p>
      </div>
      <div v-if="pricingQuery.packs.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
      <div v-else-if="pricingQuery.packs.isError.value" class="text-destructive font-fell text-sm">Failed to load packs.</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-border">
            <th class="text-left pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Pack</th>
            <th class="text-right pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase w-20">Credits</th>
            <th class="text-right pb-2 pl-3 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase w-24">Price</th>
            <th class="pb-2 pl-3 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Stripe Price ID</th>
            <th class="w-16" />
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="pack in pricingQuery.packs.data.value" :key="pack.pack_id">
            <td class="py-2 font-fell text-foreground">{{ pack.label }}</td>
            <td class="py-2 text-right">
              <input
                v-model.number="draftPacks[pack.pack_id].credits"
                type="number" min="1"
                class="w-16 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </td>
            <td class="py-2 pl-3 text-right font-fell text-xs text-muted-foreground whitespace-nowrap">
              {{ pack.stripe_unit_amount && pack.stripe_currency
                ? new Intl.NumberFormat(undefined, { style: 'currency', currency: pack.stripe_currency.toUpperCase() }).format(pack.stripe_unit_amount / 100)
                : '—' }}
            </td>
            <td class="py-2 pl-3">
              <input
                v-model="draftPacks[pack.pack_id].stripe_price_id"
                type="text"
                placeholder="price_…"
                class="w-full bg-muted border border-border rounded px-2 py-1 font-mono text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                :class="draftPacks[pack.pack_id].stripe_price_id ? 'text-green-400' : 'text-amber-400'"
              />
            </td>
            <td class="py-2 pl-2 text-right">
              <button
                class="px-2.5 py-1 font-cinzel text-[10px] font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                :disabled="packSaving[pack.pack_id]"
                @click="savePack(pack)"
              >
                {{ packSaving[pack.pack_id] ? '…' : 'Save' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Generation costs -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Generation Costs</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
          Credits deducted per generation when not using BYOK (server-side mode).
        </p>
      </div>
      <div v-if="pricingQuery.generationCosts.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
      <div v-else-if="pricingQuery.generationCosts.isError.value" class="text-destructive font-fell text-sm">Failed to load costs.</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-border">
            <th class="text-left pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Generator</th>
            <th class="text-right pb-2 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase w-32">Credits</th>
            <th class="text-right pb-2 pl-4 font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Calibration</th>
            <th class="w-16" />
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="gen in pricingQuery.generationCosts.data.value" :key="gen.generation_type">
            <td class="py-2">
              <p class="font-fell text-foreground">{{ gen.label }}</p>
              <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">{{ gen.generation_type }}</p>
            </td>
            <td class="py-2 text-right">
              <input
                v-model.number="draftGenCosts[gen.generation_type]"
                type="number" min="0"
                class="w-24 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </td>
            <td class="py-2 pl-4 text-right">
              <span v-if="calibrationQuery.isPending.value" class="font-fell text-[10px] text-muted-foreground/40">…</span>
              <span v-else-if="!calibrationHints[gen.generation_type]" class="font-fell text-[10px] text-muted-foreground/30">—</span>
              <!-- No suggestion yet (< 20 samples) — show raw cost as informational -->
              <span
                v-else-if="calibrationHints[gen.generation_type].suggested_cost === null"
                class="font-cinzel text-[10px] text-muted-foreground/50 tracking-wide whitespace-nowrap"
                :title="`${calibrationHints[gen.generation_type].sample_size} samples (need 20 for suggestion)`"
              >~${{ (calibrationHints[gen.generation_type].avg_actual_usd_cents / 100).toFixed(4) }}</span>
              <!-- Well calibrated — green -->
              <span
                v-else-if="calibrationStatus(calibrationHints[gen.generation_type]) === 'ok'"
                class="font-cinzel text-[10px] text-green-500 tracking-wide"
                :title="`avg actual: $${(calibrationHints[gen.generation_type].avg_actual_usd_cents / 100).toFixed(4)} (${calibrationHints[gen.generation_type].sample_size} samples)`"
              >✓</span>
              <!-- Under-charging: current cost < API cost — red, raise price -->
              <span
                v-else-if="calibrationStatus(calibrationHints[gen.generation_type]) === 'under'"
                class="font-cinzel text-[10px] text-red-500 tracking-wide whitespace-nowrap font-semibold"
                :title="`Under-charging — avg actual: $${(calibrationHints[gen.generation_type].avg_actual_usd_cents / 100).toFixed(4)} (${calibrationHints[gen.generation_type].sample_size} samples)`"
              >↑ {{ calibrationHints[gen.generation_type].suggested_cost }}</span>
              <!-- Over-charging: steep margin — blue -->
              <span
                v-else
                class="font-cinzel text-[10px] text-sky-400 tracking-wide whitespace-nowrap"
                :title="`Steep margin — avg actual: $${(calibrationHints[gen.generation_type].avg_actual_usd_cents / 100).toFixed(4)} (${calibrationHints[gen.generation_type].sample_size} samples)`"
              >↓ {{ calibrationHints[gen.generation_type].suggested_cost }}</span>
            </td>
            <td class="py-2 pl-2 text-right">
              <button
                class="px-2.5 py-1 font-cinzel text-[10px] font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                :disabled="genCostSaving[gen.generation_type]"
                @click="saveGenCost(gen)"
              >
                {{ genCostSaving[gen.generation_type] ? '…' : 'Save' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from "vue";
import { useAdminPricing } from "@/composables/useAdminPricing";
import type { CreditPackConfig, GenerationCreditCost } from "@/composables/useAdminPricing";
import { useCheckoutConfig } from "@/composables/useCheckoutConfig";
import { useAdminCalibration } from "@/composables/useAdminCalibration";
import type { CalibrationHint } from "@/composables/useAdminCalibration";

const pricingQuery = useAdminPricing();
const calibrationQuery = useAdminCalibration();
const checkoutConfig = useCheckoutConfig();

const CALIBRATION_THRESHOLD = 0.20;

const calibrationHints = computed(() => {
  const map: Record<string, CalibrationHint> = {};
  for (const h of calibrationQuery.data.value ?? []) {
    map[h.generation_type] = h;
  }
  return map;
});

type CalibrationStatus = "ok" | "under" | "over";

function calibrationStatus(hint: CalibrationHint): CalibrationStatus {
  if (hint.suggested_cost === null) return "ok";
  const deviation = (hint.current_cost - hint.suggested_cost) / hint.suggested_cost;
  if (deviation < 0) return "under";
  if (deviation > CALIBRATION_THRESHOLD) return "over";
  return "ok";
}

type PackDraft = { credits: number; stripe_price_id: string };
const draftPacks = reactive<Record<string, PackDraft>>({});
const packSaving = reactive<Record<string, boolean>>({});

watch(
  () => pricingQuery.packs.data.value,
  (packs) => {
    if (!packs) return;
    for (const p of packs) {
      if (!(p.pack_id in draftPacks)) {
        draftPacks[p.pack_id] = { credits: p.credits, stripe_price_id: p.stripe_price_id ?? "" };
      }
    }
  },
  { immediate: true },
);

async function savePack(pack: CreditPackConfig) {
  packSaving[pack.pack_id] = true;
  const draft = draftPacks[pack.pack_id];
  try {
    const priceId = draft.stripe_price_id.trim();
    if (priceId) {
      await pricingQuery.syncStripePrice.mutateAsync({
        packId: pack.pack_id,
        stripePriceId: priceId,
        credits: draft.credits,
      });
    } else {
      await pricingQuery.updatePack.mutateAsync({
        pack_id: pack.pack_id,
        credits: draft.credits,
      });
    }
  } finally {
    packSaving[pack.pack_id] = false;
  }
}

const draftGenCosts = reactive<Record<string, number>>({});
const genCostSaving = reactive<Record<string, boolean>>({});

watch(
  () => pricingQuery.generationCosts.data.value,
  (costs) => {
    if (!costs) return;
    for (const c of costs) {
      if (!(c.generation_type in draftGenCosts)) {
        draftGenCosts[c.generation_type] = c.credit_cost;
      }
    }
  },
  { immediate: true },
);

async function saveGenCost(gen: GenerationCreditCost) {
  genCostSaving[gen.generation_type] = true;
  try {
    await pricingQuery.updateGenerationCost.mutateAsync({
      generation_type: gen.generation_type,
      credit_cost: draftGenCosts[gen.generation_type],
    });
  } finally {
    genCostSaving[gen.generation_type] = false;
  }
}
</script>
