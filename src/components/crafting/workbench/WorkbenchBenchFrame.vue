<template>
  <figure class="wb-scene relative m-0 overflow-hidden rounded-lg border border-border bg-muted" :aria-label="art.bench.label">
    <img :src="art.src" alt="" aria-hidden="true" draggable="false" class="block aspect-3/2 w-full object-cover" />

    <!-- While the dice are in the air the apparatus glows. -->
    <div class="wb-glow pointer-events-none absolute inset-x-0 top-0 h-1/2" :class="{ 'wb-glow-on': rolling }" aria-hidden="true" />

    <WorkbenchOutcomeFx v-if="outcome" :outcome="outcome" layer="back" />

    <!-- The dishes stand on the bench's lower area. -->
    <div
      class="absolute inset-x-0 top-[63%] -translate-y-1/2"
      :style="{ '--dish-w': bandWidth }"
    >
      <div
        v-if="!stripped"
        role="list"
        :aria-label="listLabel"
        class="flex flex-col-reverse items-center"
        @keydown="onKeydown"
      >
        <div
          v-for="(row, r) in rows"
          :key="r"
          class="relative flex items-start justify-center gap-2"
          :class="{ 'z-10': r === 0 }"
          :style="r === 1 ? { '--dish-w': backWidth, marginBottom: 'calc(var(--dish-w) * -0.15)' } : undefined"
        >
          <div v-for="i in row" :key="i" role="listitem">
            <slot name="dish" v-bind="dishSlot(i)" />
          </div>
        </div>
      </div>

      <div v-else class="relative">
        <div
          ref="stripEl"
          role="list"
          :aria-label="listLabel"
          class="wb-strip px-3 pb-1"
          :style="{ '--dish-w': stripWidth }"
          @keydown="onKeydown"
          @scroll.passive="updateMore"
        >
          <div v-for="i in indexes" :key="i" role="listitem" class="wb-strip-cell">
            <slot name="dish" v-bind="dishSlot(i)" />
          </div>
        </div>
        <p v-if="moreCount > 0" class="absolute right-2 top-0 rounded bg-card px-2 py-0.5 text-caption text-foreground shadow-md" aria-live="polite">
          {{ moreCount }} more &rarr;
        </p>
      </div>
    </div>

    <WorkbenchOutcomeFx v-if="outcome" :outcome="outcome" layer="front" />

    <slot name="overlay" />

    <AiGeneratedBadge variant="chip" :provenance="WORKBENCH_ART_PROVENANCE" />
  </figure>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type ComponentPublicInstance } from "vue";
import AiGeneratedBadge from "@/components/common/ai/AiGeneratedBadge.vue";
import WorkbenchOutcomeFx from "@/components/crafting/workbench/WorkbenchOutcomeFx.vue";
import { WORKBENCH_ART_PROVENANCE } from "@/data/workbenchArt";
import type { BenchArt } from "@/lib/crafting/workbench/art";
import type { CraftingAttemptResult } from "@/types/crafting.types";

/**
 * The bench both workbenches stand on: the picture, the outcome effects, the dish rows laid out by
 * count and one roving tab stop. What stands in each dish is the parent's, through the `dish` slot;
 * `overlay` is for anything drawn over the finished scene.
 */
const { art, count, outcome = null, rolling = false, listLabel = "Ingredients" } = defineProps<{
  art: BenchArt;
  /** How many dishes stand on the bench. */
  count: number;
  outcome?: CraftingAttemptResult["outcome"] | null;
  rolling?: boolean;
  listLabel?: string;
}>();

defineSlots<{
  dish(props: {
    index: number;
    tabindex: 0 | -1;
    setRef: (el: Element | ComponentPublicInstance | null) => void;
    onFocusin: () => void;
  }): unknown;
  overlay(): unknown;
}>();

const indexes = computed(() => Array.from({ length: count }, (_, i) => i));

// Layout by count. Container-relative caps keep a full row inside a narrow scene.
const stripped = computed(() => count > 8);
const frontCount = computed(() => (count <= 4 ? count : Math.ceil((count + 1) / 2)));
const rows = computed(() => {
  if (count <= 4) return [indexes.value];
  return [indexes.value.slice(0, frontCount.value), indexes.value.slice(frontCount.value)];
});
const bandWidth = computed(() => {
  if (count === 1) return "min(12.5rem, 32cqw)";
  if (count <= 4) return "min(10.625rem, 23cqw)";
  return "min(9.5rem, 17cqw)";
});
const backWidth = "min(8.75rem, 15cqw)";
const stripWidth = "min(8.75rem, 17cqw)";

// Roving tabindex: one tab stop for the bench; arrows move between dishes.
const focusIndex = ref(0);
const refs = new Map<number, { focus: () => void }>();
function setRefFor(index: number) {
  return (inst: Element | ComponentPublicInstance | null) => {
    if (inst) refs.set(index, inst as unknown as { focus: () => void });
    else refs.delete(index);
  };
}
function dishSlot(index: number) {
  return {
    index,
    tabindex: index === Math.min(focusIndex.value, count - 1) ? (0 as const) : (-1 as const),
    setRef: setRefFor(index),
    onFocusin: () => {
      focusIndex.value = index;
    },
  };
}

function onKeydown(e: KeyboardEvent) {
  const last = count - 1;
  const cur = focusIndex.value;
  let next: number | null = null;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(cur + 1, last);
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(cur - 1, 0);
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = last;
  if (next === null) return;
  e.preventDefault();
  focusIndex.value = next;
  void nextTick(() => refs.get(next)?.focus());
}

// "N more" counts the dishes still out of view to the right of the strip.
const stripEl = ref<HTMLElement | null>(null);
const moreCount = ref(0);
function updateMore() {
  const el = stripEl.value;
  if (!el) {
    moreCount.value = 0;
    return;
  }
  const edge = el.scrollLeft + el.clientWidth;
  moreCount.value = [...el.querySelectorAll<HTMLElement>(".wb-strip-cell")].filter(
    (c) => c.offsetLeft + c.offsetWidth > edge + 1,
  ).length;
}
onMounted(updateMore);
watch(() => count, () => nextTick(updateMore));
</script>

<style scoped>
.wb-scene {
  container-type: inline-size;
}
.wb-glow {
  background: radial-gradient(ellipse 55% 70% at 50% 45%, rgb(255 170 70 / 0.55), transparent 70%);
  opacity: 0;
}
.wb-glow-on {
  opacity: 1;
}
@media (prefers-reduced-motion: no-preference) {
  .wb-glow {
    transition: opacity 1s ease;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wb-glow {
    display: none;
  }
}
.wb-strip {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(2, auto);
  grid-auto-columns: calc(var(--dish-w) + 0.75rem);
  gap: 0.5rem 0.25rem;
  overflow-x: auto;
  justify-content: start;
}
.wb-strip-cell {
  display: flex;
  justify-content: center;
}
</style>
