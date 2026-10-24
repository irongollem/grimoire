<template>
  <WorkbenchBenchFrame :art="art" :count="slots.length" :outcome="outcome" :rolling="rolling">
    <template #dish="{ index, tabindex, setRef, onFocusin }">
      <WorkbenchSlot
        v-bind="slotProps(slots[index])"
        :ref="setRef"
        :tabindex="tabindex"
        @open="(el) => emit('open', slots[index], el)"
        @focusin="onFocusin"
      />
    </template>

    <template #overlay>
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
    </template>
  </WorkbenchBenchFrame>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/media/FocalImage.vue";
import WorkbenchBenchFrame from "@/components/crafting/workbench/WorkbenchBenchFrame.vue";
import WorkbenchSlot from "@/components/crafting/workbench/WorkbenchSlot.vue";
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
</script>

<style scoped>
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
</style>
