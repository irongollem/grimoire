<template>
  <!--
    Compact relationship filter for the mobile filter sheet. The full
    seven-option relationship scale (All · Hostile … Helpful · Unknown) is too
    wide to fit a phone as text segments, so each level collapses to a short
    symbol on a scale (-- - 0 + ++) plus ? for unknown, tinted with the same
    NPC_RELATIONSHIP_COLORS the desktop relationship wheel uses. Ordered as a
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
      :style="chipStyle(opt)"
      :class="allActiveClass(opt)"
      @click="model = opt.value"
    >
      {{ opt.symbol }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { NPC_RELATIONSHIP_COLORS, type NpcRelationship } from "@/types/npc.types";

const model = defineModel<NpcRelationship | "all">({ required: true });

interface RelOption {
  value: NpcRelationship | "all";
  symbol: string;
  label: string;
  color: string | null;
}

// Negative → positive scale, with All first and Unknown last.
const OPTIONS: readonly RelOption[] = [
  { value: "all", symbol: "All", label: "All", color: null },
  { value: "hostile", symbol: "--", label: "Hostile", color: NPC_RELATIONSHIP_COLORS.hostile },
  { value: "unfriendly", symbol: "-", label: "Unfriendly", color: NPC_RELATIONSHIP_COLORS.unfriendly },
  { value: "indifferent", symbol: "0", label: "Indifferent", color: NPC_RELATIONSHIP_COLORS.indifferent },
  { value: "friendly", symbol: "+", label: "Friendly", color: NPC_RELATIONSHIP_COLORS.friendly },
  { value: "helpful", symbol: "++", label: "Helpful", color: NPC_RELATIONSHIP_COLORS.helpful },
  { value: "unknown", symbol: "?", label: "Unknown", color: NPC_RELATIONSHIP_COLORS.unknown },
] as const;

// The colored levels are tinted inline (their colours are JS values, not theme
// tokens). The "All" chip has no level colour, so it uses theme classes instead.
function chipStyle(opt: RelOption): Record<string, string> {
  if (!opt.color) return {};
  const active = model.value === opt.value;
  return active
    ? { backgroundColor: opt.color, borderColor: opt.color, color: "#fff" }
    : { borderColor: opt.color + "66", color: opt.color };
}

function allActiveClass(opt: RelOption): string {
  if (opt.color) return "";
  return model.value === opt.value
    ? "border-primary bg-primary text-primary-foreground"
    : "border-border text-muted-foreground";
}
</script>
