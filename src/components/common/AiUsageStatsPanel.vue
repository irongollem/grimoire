<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">{{ title }}</h2>
      <p v-if="subtitle" class="font-fell text-xs text-muted-foreground italic mt-0.5">{{ subtitle }}</p>
    </div>

    <div v-if="stats.isPending.value" class="text-center py-4">
      <div class="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
    </div>

    <template v-else>
      <div class="grid grid-cols-3 gap-2">
        <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
          <p class="font-cinzel text-base font-bold text-foreground">{{ stats.totalGenerations.value }}</p>
          <p class="font-fell text-[0.6875rem] text-muted-foreground italic">Total gens</p>
        </div>
        <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
          <p v-if="currency === 'credits'" class="font-cinzel text-base font-bold text-foreground">{{ Math.round(stats.totalCreditsSpent.value) }}</p>
          <p v-else class="font-cinzel text-base font-bold text-foreground">${{ stats.totalEstimatedCostUsd.value.toFixed(2) }}</p>
          <p class="font-fell text-[0.6875rem] text-muted-foreground italic">{{ currency === 'credits' ? 'Credits used' : 'Est. cost (USD)' }}</p>
        </div>
        <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
          <p class="font-cinzel text-base font-bold text-foreground">{{ stats.byokCount.value }}</p>
          <p class="font-fell text-[0.6875rem] text-muted-foreground italic">BYOK gens</p>
        </div>
      </div>

      <div v-if="displayStats.length" class="space-y-1">
        <div class="flex items-center gap-2 px-2.5 pb-0.5">
          <span class="flex-1 text-eyebrow text-muted-foreground">Model</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-10 text-right">Gens</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-20 text-right">Total</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-20 text-right">Avg/gen</span>
        </div>
        <div
          v-for="stat in displayStats"
          :key="stat.model"
          class="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5"
        >
          <div class="flex-1 min-w-0">
            <span class="font-cinzel text-xs font-semibold text-foreground">{{ stat.model }}</span>
            <span class="font-fell text-[0.6875rem] text-muted-foreground italic ml-1">· {{ stat.provider }}</span>
          </div>
          <span class="font-fell text-xs text-muted-foreground shrink-0 w-10 text-right">{{ currency === 'credits' ? stat.charged_count : stat.count }}×</span>
          <template v-if="currency === 'credits'">
            <span class="font-cinzel text-xs text-foreground shrink-0 w-20 text-right">{{ Math.round(stat.credits) }} cr</span>
            <span class="font-cinzel text-xs text-muted-foreground shrink-0 w-20 text-right">{{ stat.avg_credits.toFixed(1) }} cr</span>
          </template>
          <template v-else>
            <span class="font-cinzel text-xs text-foreground shrink-0 w-20 text-right">${{ stat.estimated_cost_usd.toFixed(3) }}</span>
            <span class="font-cinzel text-xs text-muted-foreground shrink-0 w-20 text-right">${{ stat.avg_cost_usd.toFixed(4) }}</span>
          </template>
        </div>
      </div>

      <p v-else class="font-fell text-xs text-muted-foreground italic">No generation data yet.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAiUsageStats } from "@/composables/useAiUsageStats";

const { title = "AI Usage Stats", subtitle = "", currency = "usd" } = defineProps<{
  title?: string;
  subtitle?: string;
  /** "usd" for the admin/company view, "credits" for the customer view. */
  currency?: "usd" | "credits";
}>();

// RLS-scoped to the current user's own ledger, so this shows the viewer's usage.
const stats = useAiUsageStats();

// In the customer credits view, hide models that only ran BYOK (0 credits spent).
const displayStats = computed(() =>
  currency === "credits"
    ? stats.modelStats.value.filter((s) => s.charged_count > 0)
    : stats.modelStats.value,
);
</script>
