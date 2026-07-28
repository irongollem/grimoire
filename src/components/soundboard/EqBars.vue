<template>
  <!--
    A "this is audible" indicator that reads at a glance across a table.
    Purely decorative, so it is hidden from assistive tech — the surrounding
    row already names what is playing.
  -->
  <span class="flex h-2.5 items-end gap-px" aria-hidden="true">
    <span
      v-for="bar in bars"
      :key="bar"
      class="h-full w-px origin-bottom animate-eq rounded-full"
      :class="BAR_COLOUR[accent]"
      :style="{ animationDelay: `${(bar - 1) * 0.17}s` }"
    />
  </span>
</template>

<script setup lang="ts">
import { CATEGORY_SPINE } from "@/lib/soundCategories";
import type { SoundCategory } from "@/types/sound.types";

// The bars carry category colour for the same reason the spine does: a DM
// should be able to tell what kind of thing is audible without reading.
const BAR_COLOUR = CATEGORY_SPINE;

const { accent = "music", bars = 4 } = defineProps<{
  accent?: SoundCategory;
  bars?: number;
}>();
</script>
