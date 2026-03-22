<template>
  <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
    <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">
      Difficulty Analysis
    </h2>

    <!-- Difficulty badge -->
    <div class="flex items-center justify-center py-3">
      <span
        class="px-6 py-2 rounded-lg font-cinzel text-xl font-bold text-white shadow"
        :style="{ backgroundColor: DIFFICULTY_COLORS[props.difficulty.label] }"
      >
        {{ props.difficulty.label }}
      </span>
    </div>

    <!-- XP breakdown -->
    <div class="flex flex-col gap-1.5 font-cinzel text-xs">
      <div class="flex justify-between">
        <span class="text-muted-foreground">Enemy XP</span>
        <span class="font-bold text-foreground">{{ props.difficulty.rawXp.toLocaleString() }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Multiplier</span>
        <span class="font-bold text-foreground">× {{ props.difficulty.multiplier }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Adjusted XP</span>
        <span class="font-bold text-foreground">{{ props.difficulty.adjustedXp.toLocaleString() }}</span>
      </div>
      <template v-if="props.difficulty.allyAdjustedXp > 0">
        <div class="flex justify-between">
          <span class="text-muted-foreground">
            Ally offset
            <span class="text-[10px]">(× {{ props.difficulty.allyMultiplier }})</span>
          </span>
          <span class="font-bold text-green-500">− {{ props.difficulty.allyAdjustedXp.toLocaleString() }}</span>
        </div>
        <div class="flex justify-between border-t border-border pt-1.5 mt-0.5">
          <span class="text-muted-foreground">Net XP</span>
          <span class="font-bold text-primary">{{ props.difficulty.netXp.toLocaleString() }}</span>
        </div>
      </template>
      <div v-else class="flex justify-between border-t border-border pt-1.5 mt-0.5">
        <span class="text-muted-foreground">Net XP</span>
        <span class="font-bold text-primary">{{ props.difficulty.adjustedXp.toLocaleString() }}</span>
      </div>
    </div>

    <!-- Threshold bars -->
    <div v-if="props.difficulty.partyThresholds.deadly > 0" class="flex flex-col gap-2">
      <div class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1">
        PARTY THRESHOLDS
      </div>
      <div v-for="tier in props.thresholdTiers" :key="tier.label" class="flex items-center gap-2">
        <span class="font-cinzel text-[10px] w-14 shrink-0" :style="{ color: tier.color }">
          {{ tier.label }}
        </span>
        <div class="flex-1 h-2 rounded-full bg-muted overflow-hidden relative">
          <div
            class="h-full rounded-full transition-all duration-300"
            :style="{ width: `${tier.pct}%`, backgroundColor: tier.color }"
          />
          <!-- XP marker -->
          <div
            v-if="props.difficulty.netXp > 0 && markerPct > 0 && markerPct <= 100"
            class="absolute top-0 h-full w-0.5 bg-white/80"
            :style="{ left: `${markerPct}%` }"
          />
        </div>
        <span class="font-cinzel text-[10px] text-muted-foreground w-12 text-right shrink-0">
          {{ tier.value.toLocaleString() }}
        </span>
      </div>
    </div>

    <!-- Enemy breakdown -->
    <div v-if="props.enemyEntries.length" class="flex flex-col gap-1 border-t border-border pt-3">
      <div class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1">
        ENEMY BREAKDOWN
      </div>
      <div
        v-for="entry in props.enemyEntries"
        :key="entry.id"
        class="flex items-center justify-between font-cinzel text-[11px]"
      >
        <span class="text-foreground line-clamp-1 flex-1">
          {{ entry.name }}{{ entry.count > 1 ? ` ×${entry.count}` : "" }}
        </span>
        <span class="text-muted-foreground shrink-0 ml-2">
          CR {{ entry.cr }} · {{ (entry.xpEach * entry.count).toLocaleString() }} XP
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DIFFICULTY_COLORS } from "@/types/encounter.types";
import type { DifficultyResult } from "@/types/encounter.types";

const props = defineProps<{
  difficulty: DifficultyResult;
  thresholdTiers: { label: string; value: number; color: string; pct: number }[];
  enemyEntries: { id: string; name: string; cr: string; count: number; xpEach: number }[];
}>();

const markerPct = computed(() => {
  const max = props.difficulty.partyThresholds.deadly * 1.5 || 1;
  return Math.min(100, (props.difficulty.netXp / max) * 100);
});
</script>
