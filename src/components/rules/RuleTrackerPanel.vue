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
        :class="value >= resolveThreshold(lvl.value) ? levelBarColorClass(lvl.color) : 'bg-muted'"
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
        {{ effectLabel(effect) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TrackerDef, TrackerEffect, TrackerLevel, AbilityCode } from "@/types/rule.types";

type AbilityScores = Record<Lowercase<AbilityCode>, number>;

const props = defineProps<{
  tracker: TrackerDef;
  value: number;
  abilityScores?: AbilityScores;
}>();

function resolveThreshold(raw: number | AbilityCode): number {
  if (typeof raw === "number") return raw;
  const score = props.abilityScores?.[raw.toLowerCase() as Lowercase<AbilityCode>] ?? 10;
  return Math.floor((score - 10) / 2);
}

const currentLevel = computed<TrackerLevel | undefined>(() => {
  if (props.tracker.type !== "level" || !props.tracker.levels) return undefined;
  // Find the highest level whose resolved threshold ≤ current value
  return [...props.tracker.levels]
    .filter((l) => resolveThreshold(l.value) <= props.value)
    .sort((a, b) => resolveThreshold(b.value) - resolveThreshold(a.value))[0];
});

const activeEffects = computed<TrackerEffect[]>(() => {
  if (!currentLevel.value?.effects) return [];
  return currentLevel.value.effects;
});

const LEVEL_COLORS: Record<string, { badge: string; bar: string }> = {
  green:  { badge: "bg-green-500/20 text-green-400",   bar: "bg-green-500" },
  yellow: { badge: "bg-yellow-500/20 text-yellow-400", bar: "bg-yellow-500" },
  orange: { badge: "bg-orange-500/20 text-orange-400", bar: "bg-orange-500" },
  red:    { badge: "bg-red-500/20 text-red-400",       bar: "bg-red-500" },
  blue:   { badge: "bg-blue-500/20 text-blue-400",     bar: "bg-blue-500" },
  purple: { badge: "bg-purple-500/20 text-purple-400", bar: "bg-purple-500" },
};

function levelColorClass(color?: string): string {
  return LEVEL_COLORS[color ?? ""]?.badge ?? "bg-muted text-muted-foreground";
}

function levelBarColorClass(color?: string): string {
  return LEVEL_COLORS[color ?? ""]?.bar ?? "bg-primary";
}

const ABILITY_NAMES: Record<string, string> = {
  STR: "Strength", DEX: "Dexterity", CON: "Constitution",
  INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma",
};

function effectLabel(effect: TrackerEffect): string {
  if (effect.type === "save") {
    const name = ABILITY_NAMES[effect.ability ?? ""] ?? effect.ability ?? "?";
    const dc = (effect.dcBase ?? 0) + (effect.dcAddTracker ? props.value : 0);
    return effect.label || `${name} save DC ${dc}`;
  }
  return effect.label;
}
</script>
