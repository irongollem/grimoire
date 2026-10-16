<template>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Board surface">
    <AppButton
      v-for="option in OPTIONS"
      :key="option.value"
      variant="subtle"
      size="body"
      block
      role="radio"
      :active="modelValue === option.value"
      :aria-checked="modelValue === option.value"
      class="h-auto flex-col items-stretch justify-start gap-2 whitespace-normal p-2 text-left"
      :data-surface="option.value"
      @click="emit('update:modelValue', option.value)"
    >
      <!-- A patch of the real texture inside its real frame colour, so the choice is what will hang on the wall. -->
      <span
        class="swatch block h-20 w-full rounded-md border-4"
        :style="{ backgroundImage: surfaceImageSet(option.value), borderColor: option.rail }"
        aria-hidden="true"
      />
      <span class="px-1 pb-1">
        <span class="block text-heading-xs font-bold text-foreground">{{ option.title }}</span>
        <span class="block text-caption font-normal text-muted-foreground">{{ option.hint }}</span>
      </span>
    </AppButton>
  </div>
</template>

<script setup lang="ts">
/**
 * Cork in an oak frame or planks in a pine one: the board's look, picked by what it hangs in. These are choice cards
 * rather than a SegmentedControl because the point of the choice is seeing the material.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { surfaceImageSet } from "@/lib/noticeBoard/art";
import type { NoticeBoardSurface } from "@/types/noticeBoard.types";

defineProps<{ modelValue: NoticeBoardSurface }>();
const emit = defineEmits<{ "update:modelValue": [value: NoticeBoardSurface] }>();

const OPTIONS: ReadonlyArray<{ value: NoticeBoardSurface; title: string; hint: string; rail: string }> = [
  { value: "cork", title: "Tavern cork, oak frame", hint: "For a city, an inn, a guildhall.", rail: "#5b3a1e" },
  { value: "planks", title: "Frontier planks, pine frame", hint: "For an outpost, a camp, a village green.", rail: "#c9a574" },
];
</script>

<style scoped>
.swatch {
  /* The tile repeats at a size that shows grain at swatch scale. */
  background-size: 8rem;
}
</style>
