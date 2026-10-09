<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">{{ title }}</h2>
      <p v-if="subtitle" class="text-caption text-muted-foreground italic mt-0.5">{{ subtitle }}</p>
    </div>

    <div v-if="stats.isPending.value" class="text-center py-4">
      <BannerLoader class="h-8" />
    </div>

    <template v-else>
      <div class="grid grid-cols-3 gap-2">
        <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
          <p class="text-heading-sm font-bold text-foreground">{{ stats.totalGenerations.value }}</p>
          <p class="text-caption text-muted-foreground italic">Total gens</p>
        </div>
        <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
          <p v-if="currency === 'credits'" class="text-heading-sm font-bold text-foreground">{{ Math.round(stats.totalCreditsSpent.value) }}</p>
          <p v-else class="text-heading-sm font-bold text-foreground">${{ stats.totalEstimatedCostUsd.value.toFixed(2) }}</p>
          <p class="text-caption text-muted-foreground italic">{{ currency === 'credits' ? 'Credits used' : 'Est. cost (USD)' }}</p>
        </div>
        <div class="rounded-md bg-muted/30 border border-border px-3 py-2 text-center">
          <p class="text-heading-sm font-bold text-foreground">{{ stats.byokCount.value }}</p>
          <p class="text-caption text-muted-foreground italic">BYOK gens</p>
        </div>
      </div>

      <!-- Per-model rows are the admin's view only: which model ran is the
           platform's business, and a DM is told credits, not model names. -->
      <div v-if="currency === 'usd' && stats.modelStats.value.length" class="space-y-1">
        <div class="flex items-center gap-2 px-2.5 pb-0.5">
          <span class="flex-1 text-eyebrow text-muted-foreground">Model</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-10 text-right">Gens</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-20 text-right">Total</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-20 text-right">Avg/gen</span>
        </div>
        <div
          v-for="stat in stats.modelStats.value"
          :key="stat.label"
          class="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5"
        >
          <div class="flex-1 min-w-0">
            <span class="text-caption font-semibold text-foreground">{{ stat.label }}</span>
            <span class="text-caption text-muted-foreground italic ml-1">· {{ stat.provider }}</span>
          </div>
          <span class="text-caption text-muted-foreground shrink-0 w-10 text-right">{{ stat.count }}×</span>
          <span class="text-label-lg text-foreground shrink-0 w-20 text-right">${{ stat.estimated_cost_usd.toFixed(3) }}</span>
          <span class="text-label-lg text-muted-foreground shrink-0 w-20 text-right">${{ stat.avg_cost_usd.toFixed(4) }}</span>
        </div>
      </div>

      <p v-else-if="stats.totalGenerations.value === 0" class="text-caption text-muted-foreground italic">No generation data yet.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { useAiUsageStats } from "@/composables/ai/useAiUsageStats";

const { title = "AI Usage Stats", subtitle = "", currency = "usd" } = defineProps<{
  title?: string;
  subtitle?: string;
  /** "usd" for the admin/company view, "credits" for the customer view. */
  currency?: "usd" | "credits";
}>();

// RLS-scoped to the current user's own ledger, so this shows the viewer's usage.
const stats = useAiUsageStats();
</script>
