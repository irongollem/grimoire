<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      class="rounded-full border px-3 py-1 font-cinzel text-xs tracking-wide transition-colors"
      :class="model === opt.value ? ACTIVE_CLASS[opt.value] : IDLE_CLASS[opt.value]"
      @click="model = opt.value"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { SoundCategory } from "@/types/sound.types";

/**
 * The filter speaks the same colour as everything it filters.
 *
 * Category colour is load-bearing across the soundboard — the spine on a pad,
 * the eq bars, the fader accent — and this was the one place it was not
 * spoken: every active pill was gold regardless of what it selected. Filtering
 * to Effects and getting a gold pill quietly contradicts the blue spines it
 * leaves on screen.
 *
 * Classes are written out per option because Tailwind's scanner has to see
 * every literal string.
 */

type FilterValue = SoundCategory | "all";

const OPTIONS: { label: string; value: FilterValue }[] = [
  { label: "All", value: "all" },
  { label: "Ambient", value: "ambient" },
  { label: "Music", value: "music" },
  { label: "Effects", value: "effects" },
  { label: "Misc", value: "misc" },
];

const ACTIVE_CLASS: Record<FilterValue, string> = {
  all: "bg-gold-500/20 border-gold-500/60 text-gold-300",
  ambient: "bg-green-400/20 border-green-400/60 text-green-300",
  music: "bg-gold-400/20 border-gold-400/60 text-gold-300",
  effects: "bg-blue-500/20 border-blue-500/60 text-blue-300",
  misc: "bg-arcane-purple-light/20 border-arcane-purple-light/60 text-arcane-purple-light",
};

/**
 * Idle pills keep a trace of their hue rather than going uniformly grey, so
 * the colour coding is learnable before anything is selected.
 */
const IDLE_CLASS: Record<FilterValue, string> = {
  all: "border-border text-muted-foreground hover:text-foreground hover:border-border/80",
  ambient: "border-green-400/30 text-green-400/80 hover:text-green-300 hover:border-green-400/50",
  music: "border-gold-400/30 text-gold-400/80 hover:text-gold-300 hover:border-gold-400/50",
  effects: "border-blue-500/30 text-blue-500/80 hover:text-blue-400 hover:border-blue-500/50",
  misc: "border-arcane-purple-light/30 text-arcane-purple-light/80 hover:text-arcane-purple-light hover:border-arcane-purple-light/50",
};

const model = defineModel<FilterValue>({ required: true });
</script>
