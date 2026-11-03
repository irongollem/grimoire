<template>
  <SegmentedControl
    :model-value="modelValue"
    :options="options"
    icon-only
    size="icon-sm"
    variant="outline"
    class="pointer-coarse:[&_button]:size-11"
    aria-label="Deck size"
    @update:model-value="(value: DeckSize) => emit('update:modelValue', value)"
  />
</template>

<script setup lang="ts">
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { DECK_SIZES, type DeckSize } from "@/lib/audio/deck/deckSurface";
import { DECK_SIZE_HINT, DECK_SIZE_ICON, DECK_SIZE_LABEL } from "./deckSizeIcons";

/** The four-way size switch, icons only; D cycles the same four. */
defineProps<{ modelValue: DeckSize }>();
const emit = defineEmits<{ "update:modelValue": [value: DeckSize] }>();

const options: ReadonlyArray<SegmentedOption<DeckSize>> = DECK_SIZES.map((size) => ({
  value: size,
  label: DECK_SIZE_LABEL[size],
  icon: DECK_SIZE_ICON[size],
  tooltip: DECK_SIZE_HINT[size],
}));
</script>
