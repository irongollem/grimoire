<template>
  <!--
    Compact relationship filter for the mobile filter sheet. The full
    seven-option relationship scale (All · Hostile … Helpful · Unknown) is too
    wide to fit a phone as text segments, so each level collapses to a short
    symbol on a scale (-- - 0 + ++) plus ? for unknown, tinted from the same
    relationship ramp the desktop wheel uses. Ordered as a
    negative→positive scale so the symbols read naturally. Fits one row, no
    horizontal scroll. The full label is exposed via aria-label/title.
  -->
  <div class="flex items-stretch gap-1" role="radiogroup" aria-label="Relationship filter">
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      role="radio"
      :aria-checked="model === opt.value"
      :aria-label="opt.label"
      :title="opt.label"
      class="flex min-h-11 flex-1 items-center justify-center rounded-md border bg-card font-cinzel text-sm font-bold tracking-wider transition-colors"
      :class="chipClass(opt)"
      @click="model = opt.value"
    >
      {{ opt.symbol }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { npcRelationshipBg, npcRelationshipText } from "@/lib/npcDisplay";
import type { NpcRelationship } from "@/types/npc.types";

const model = defineModel<NpcRelationship | "all">({ required: true });

interface RelOption {
  value: NpcRelationship | "all";
  symbol: string;
  label: string;
}

// Negative → positive scale, with All first and Unknown last.
const OPTIONS: readonly RelOption[] = [
  { value: "all", symbol: "All", label: "All" },
  { value: "hostile", symbol: "--", label: "Hostile" },
  { value: "unfriendly", symbol: "-", label: "Unfriendly" },
  { value: "indifferent", symbol: "0", label: "Indifferent" },
  { value: "friendly", symbol: "+", label: "Friendly" },
  { value: "helpful", symbol: "++", label: "Helpful" },
  { value: "unknown", symbol: "?", label: "Unknown" },
] as const;

/**
 * Chip colours as classes (#742). These used to be inline styles built from hex
 * literals, with the level's colour concatenated to an alpha suffix — which is
 * precisely what stopped working the moment the ramp became a theme token, and
 * why it is worth not doing. `All` has no level colour and takes the primary
 * treatment.
 */
function chipClass(opt: RelOption): string {
  const active = model.value === opt.value;
  if (opt.value === "all") {
    return active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border text-muted-foreground";
  }
  const relationship = opt.value as NpcRelationship;
  return active
    ? `border-transparent text-white ${npcRelationshipBg(relationship)}`
    : `border-border/60 ${npcRelationshipText(relationship)}`;
}
</script>
