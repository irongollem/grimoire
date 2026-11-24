<template>
  <!-- What the Familiar's free answers cost the platform: five a day per account, free whatever the conversation's size. -->
  <div class="space-y-3 rounded-lg border border-border bg-card p-4" data-testid="free-ask-cost">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">Free Familiar answers</h2>
      <p class="mt-0.5 text-caption text-muted-foreground italic">
        The first {{ FREE_ASKS_PER_DAY }} answers a day are free, whatever the conversation's size. Estimated from each answer's tokens; a turn is capped at 40,000 tokens.
      </p>
    </div>
    <div v-if="query.isPending.value" class="py-4 text-center"><BannerLoader class="h-8" /></div>
    <p v-else-if="query.isError.value" role="alert" class="text-body text-destructive">The free answers could not be read.</p>
    <template v-else-if="summary">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div class="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
          <p class="text-heading-sm font-bold text-foreground">{{ summary.answers }}</p>
          <p class="text-caption text-muted-foreground italic">Answers, {{ FREE_ASK_DAYS }} days</p>
        </div>
        <div class="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
          <p class="text-heading-sm font-bold text-foreground" data-testid="free-ask-total">{{ usd(summary.totalUsd) }}</p>
          <p class="text-caption text-muted-foreground italic">Cost, {{ FREE_ASK_DAYS }} days</p>
        </div>
        <div class="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
          <p class="text-heading-sm font-bold text-foreground" data-testid="free-ask-projection">{{ usd(summary.monthlyProjectionUsd) }}</p>
          <p class="text-caption text-muted-foreground italic">A month at this week's pace</p>
        </div>
        <div class="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
          <p class="text-heading-sm font-bold text-foreground" data-testid="free-ask-dearest">{{ summary.dearest ? usd(summary.dearest.usd) : "None" }}</p>
          <p class="text-caption text-muted-foreground italic">
            Dearest answer{{ summary.dearest ? `, ${summary.dearest.inputTokens.toLocaleString()} tokens in` : "" }}
          </p>
        </div>
      </div>
      <ul class="flex flex-col divide-y divide-border text-body">
        <li v-for="d in summary.days.slice(0, 14)" :key="d.day" class="flex items-center justify-between gap-3 py-1">
          <span class="text-muted-foreground">{{ d.day }}</span>
          <span class="tabular-nums text-foreground">{{ d.answers }} {{ d.answers === 1 ? "answer" : "answers" }} · {{ usd(d.usd) }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { FREE_ASK_DAYS, useFreeAskCost } from "@/composables/admin/useFreeAskCost";
import { FREE_ASKS_PER_DAY } from "@edge-shared/agent/askContract";

const { query, summary } = useFreeAskCost();
// A free answer costs well under a cent, so small sums keep three decimals rather than all reading $0.00.
const usd = (n: number): string => (n < 1 ? "$" + n.toFixed(3) : "$" + n.toFixed(2));
</script>
