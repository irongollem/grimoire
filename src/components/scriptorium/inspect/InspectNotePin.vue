<template>
  <!-- Lives inside a laid-out page, so it scrolls, zooms and spreads with it. Sizes are rem: the page scales them. -->
  <button
    type="button"
    data-inspect-pin
    :data-inspect-pin-id="pinId"
    :aria-label="label"
    :aria-expanded="open"
    :style="{ top: `${top}px`, right: `${0.75 + stack * 2.25}rem` }"
    :class="
      cn(
        'absolute z-10 flex h-[1.875rem] w-[1.875rem] items-center justify-center rounded-full border-2 border-white bg-primary text-label-lg font-bold text-primary-foreground shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        done && 'opacity-60',
      )
    "
  >
    {{ text }}
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";

const { pinId, n = null, top, stack, open = false, done = false } = defineProps<{
  /** The note's id, or "draft"; the layer finds the element by it. */
  pinId: string;
  /** The note's number; null for the pin of a note being drafted. */
  n?: number | null;
  /** Page pixels from the page's top. */
  top: number;
  /** Position among pins on the same block, counted leftwards from the edge. */
  stack: number;
  open?: boolean;
  done?: boolean;
}>();

const text = computed(() => (n === null ? "+" : String(n)));
const label = computed(() => (n === null ? "New note" : `Note ${n}`));
</script>
