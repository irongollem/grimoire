<template>
  <div class="flex flex-col gap-1.5">
    <!-- Label + current level name -->
    <div class="flex items-center justify-between gap-2">
      <span class="text-eyebrow font-semibold text-muted-foreground">
        {{ tracker.label }}
      </span>
      <span
        v-if="tracker.type === 'level' && currentLevel"
        class="text-label font-semibold px-1.5 py-0.5 rounded"
        :class="levelColorClass(currentLevel.color)"
      >
        {{ currentLevel.label }}
      </span>
      <span v-else-if="tracker.type === 'points'" class="text-label text-muted-foreground">
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
        class="text-caption-sm italic text-destructive/80"
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
  green:  { badge: "bg-tone-success/20 text-ink-success",   bar: "bg-tone-success" },
  yellow: { badge: "bg-tone-caution/20 text-ink-caution", bar: "bg-tone-caution" },
  orange: { badge: "bg-tone-caution/20 text-ink-caution", bar: "bg-tone-caution" },
  red:    { badge: "bg-tone-danger/20 text-destructive",       bar: "bg-tone-danger" },
  blue:   { badge: "bg-tone-info/20 text-ink-info",     bar: "bg-tone-info" },
  purple: { badge: "bg-tone-arcane/20 text-ink-arcane", bar: "bg-tone-arcane" },
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
