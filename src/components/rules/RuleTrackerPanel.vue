<template>
  <div class="flex flex-col gap-1.5">
    <!-- Label + current level name -->
    <div class="flex items-center justify-between gap-2">
      <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {{ tracker.label }}
      </span>
      <span
        v-if="tracker.type === 'level' && currentLevel"
        class="font-cinzel text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded"
        :class="levelColorClass(currentLevel.color)"
      >
        {{ currentLevel.label }}
      </span>
      <span v-else-if="tracker.type === 'points'" class="font-cinzel text-[10px] text-muted-foreground">
        {{ value }} / {{ tracker.max }}
      </span>
    </div>

    <!-- Track bar (level pips or points bar) -->
    <div v-if="tracker.type === 'level'" class="flex gap-1">
      <div
        v-for="lvl in tracker.levels"
        :key="lvl.value"
        class="flex-1 h-2 rounded-full transition-colors"
        :class="value >= lvl.value ? levelBarColorClass(lvl.color) : 'bg-muted'"
      />
    </div>
    <div v-else class="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        class="h-full rounded-full bg-primary transition-all"
        :style="{ width: `${Math.max(0, Math.min(100, ((value - tracker.min) / (tracker.max - tracker.min)) * 100))}%` }"
      />
    </div>

    <!-- Active effects -->
    <div v-if="activeEffects.length" class="flex flex-wrap gap-1 mt-0.5">
      <span
        v-for="(effect, i) in activeEffects"
        :key="i"
        class="font-fell text-[10px] italic text-destructive/80"
      >
        {{ effect.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TrackerDef, TrackerEffect, TrackerLevel } from "@/types/rule.types";

const props = defineProps<{
  tracker: TrackerDef;
  value: number;
}>();

const currentLevel = computed<TrackerLevel | undefined>(() => {
  if (props.tracker.type !== "level" || !props.tracker.levels) return undefined;
  // Find the highest level whose value ≤ current value
  return [...props.tracker.levels]
    .filter((l) => l.value <= props.value)
    .sort((a, b) => b.value - a.value)[0];
});

const activeEffects = computed<TrackerEffect[]>(() => {
  if (!currentLevel.value?.effects) return [];
  return currentLevel.value.effects;
});

function levelColorClass(color?: string): string {
  const map: Record<string, string> = {
    green:  "bg-green-500/20 text-green-400",
    yellow: "bg-yellow-500/20 text-yellow-400",
    orange: "bg-orange-500/20 text-orange-400",
    red:    "bg-red-500/20 text-red-400",
    blue:   "bg-blue-500/20 text-blue-400",
    purple: "bg-purple-500/20 text-purple-400",
  };
  return map[color ?? ""] ?? "bg-muted text-muted-foreground";
}

function levelBarColorClass(color?: string): string {
  const map: Record<string, string> = {
    green:  "bg-green-500",
    yellow: "bg-yellow-500",
    orange: "bg-orange-500",
    red:    "bg-red-500",
    blue:   "bg-blue-500",
    purple: "bg-purple-500",
  };
  return map[color ?? ""] ?? "bg-primary";
}
</script>
