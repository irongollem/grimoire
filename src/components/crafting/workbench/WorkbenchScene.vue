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
        aria-label="Ingredients"
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
          <div v-for="s in row" :key="s.index" role="listitem">
            <WorkbenchSlot v-bind="slotProps(s)" :ref="setRef(s.index)" :tabindex="s.index === focusIndex ? 0 : -1" @open="(el) => emit('open', s, el)" @focusin="focusIndex = s.index" />
          </div>
        </div>
      </div>

      <div v-else class="relative">
        <div
          ref="stripEl"
          role="list"
          aria-label="Ingredients"
          class="wb-strip px-3 pb-1"
          :style="{ '--dish-w': stripWidth }"
          @keydown="onKeydown"
          @scroll.passive="updateMore"
        >
          <div v-for="s in slots" :key="s.index" role="listitem" class="wb-strip-cell">
            <WorkbenchSlot v-bind="slotProps(s)" :ref="setRef(s.index)" :tabindex="s.index === focusIndex ? 0 : -1" @open="(el) => emit('open', s, el)" @focusin="focusIndex = s.index" />
          </div>
        </div>
        <p v-if="moreCount > 0" class="absolute right-2 top-0 rounded bg-card px-2 py-0.5 text-caption text-foreground shadow-md" aria-live="polite">
          {{ moreCount }} more &rarr;
        </p>
      </div>
    </div>

    <WorkbenchOutcomeFx v-if="outcome" :outcome="outcome" layer="front" />

    <!-- A success lifts the recipe's picture out of the apparatus once the sparks have flown. -->
    <div
      v-if="outcome === 'success'"
      class="wb-card absolute left-1/2 top-[26%] flex w-48 -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border-2 bg-card"
    >
      <div class="h-32 overflow-hidden bg-muted">
        <FocalImage :src="recipeArt?.url ?? null" :alt="recipeName" format="landscape" :focal-point="recipeArt?.focalPoint ?? null" :placeholder="placeholderUrl('item')" />
      </div>
      <div class="px-2 py-1.5 text-center">
        <p class="text-eyebrow text-primary">{{ doneVerb }}</p>
        <p class="truncate text-label-lg font-semibold text-foreground">{{ outputText }}</p>
      </div>
    </div>

    <AiGeneratedBadge variant="chip" :provenance="WORKBENCH_ART_PROVENANCE" />
  </figure>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type ComponentPublicInstance } from "vue";
import AiGeneratedBadge from "@/components/common/ai/AiGeneratedBadge.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import WorkbenchOutcomeFx from "@/components/crafting/workbench/WorkbenchOutcomeFx.vue";
import WorkbenchSlot from "@/components/crafting/workbench/WorkbenchSlot.vue";
import { WORKBENCH_ART_PROVENANCE } from "@/data/workbenchArt";
import type { IngredientSlot } from "@/lib/crafting/ingredients";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { BenchArt } from "@/lib/crafting/workbench/art";
import { exitForSlot, firstUsed, slotSprite, slotState } from "@/lib/crafting/workbench/slotMaterial";
import type { RecipeArt } from "@/lib/crafting/recipeArt";
import type { CraftingAttemptResult } from "@/types/crafting.types";
import type { Item } from "@/types/item.types";

const { art, slots, preferred, allItems, outcome } = defineProps<{
  art: BenchArt;
  slots: IngredientSlot[];
  /** slot index → inventory row id the player chose to use first */
  preferred: Record<number, string>;
  allItems: Item[];
  outcome: CraftingAttemptResult["outcome"] | null;
  rolling: boolean;
  recipeName: string;
  recipeArt: RecipeArt | null;
  outputText: string;
  /** The discipline's done-verb, the eyebrow over the finished item. */
  doneVerb: string;
}>();

const emit = defineEmits<{ open: [slot: IngredientSlot, el: HTMLElement] }>();

function slotProps(s: IngredientSlot) {
  return {
    slot: s,
    total: slots.length,
    variant: "bench" as const,
    state: slotState(s, outcome),
    art,
    material: slotSprite(s, preferred[s.index], allItems),
    used: firstUsed(s, preferred[s.index]),
    exit: exitForSlot(s, outcome),
  };
}

// Layout by count. Container-relative caps keep a full row inside a narrow scene.
const stripped = computed(() => slots.length > 8);
const frontCount = computed(() => (slots.length <= 4 ? slots.length : Math.ceil((slots.length + 1) / 2)));
const rows = computed(() => {
  if (slots.length <= 4) return [slots];
  return [slots.slice(0, frontCount.value), slots.slice(frontCount.value)];
});
const bandWidth = computed(() => {
  if (slots.length === 1) return "min(12.5rem, 32cqw)";
  if (slots.length <= 4) return "min(10.625rem, 23cqw)";
  return "min(9.5rem, 17cqw)";
});
const backWidth = "min(8.75rem, 15cqw)";
const stripWidth = "min(8.75rem, 17cqw)";

// Roving tabindex: one tab stop for the bench; arrows move between dishes.
const focusIndex = ref(0);
const refs = new Map<number, { focus: () => void }>();
function setRef(index: number) {
  return (inst: Element | ComponentPublicInstance | null) => {
    if (inst) refs.set(index, inst as unknown as { focus: () => void });
    else refs.delete(index);
  };
}

function onKeydown(e: KeyboardEvent) {
  const last = slots.length - 1;
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
watch(() => slots.length, () => nextTick(updateMore));
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
.wb-card {
  border-color: var(--primary-fill, var(--primary));
  box-shadow:
    0 0 1.5rem 0.25rem color-mix(in oklab, var(--primary-fill, var(--primary)) 45%, transparent),
    0 0.5rem 1.25rem rgb(0 0 0 / 0.35);
}
@media (prefers-reduced-motion: no-preference) {
  .wb-card {
    animation: wb-card-in 600ms cubic-bezier(0.2, 0.8, 0.3, 1) 600ms both;
  }
}
@keyframes wb-card-in {
  from {
    opacity: 0;
    transform: translateY(18%) scale(0.7);
  }
  70% {
    opacity: 1;
    transform: translateY(0) scale(1.04);
  }
  to {
    opacity: 1;
    transform: none;
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
