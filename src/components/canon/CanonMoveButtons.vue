<template>
  <span class="relative z-20 flex shrink-0 items-center gap-0.5" data-testid="move-buttons">
    <AppButton v-if="toEnds" variant="ghost" size="icon-sm" :icon="IconArrowUp" :aria-label="`Move ${label} to the top`" tooltip="Move to top" :disabled="first" data-testid="move-top" @click="emit('moveTo', 'top')" />
    <AppButton variant="ghost" size="icon-sm" :icon="IconChevronUp" :aria-label="`Move ${label} up`" :disabled="first" @click="emit('move', -1)" />
    <AppButton variant="ghost" size="icon-sm" :icon="IconChevronDown" :aria-label="`Move ${label} down`" :disabled="last" @click="emit('move', 1)" />
    <AppButton v-if="toEnds" variant="ghost" size="icon-sm" :icon="IconMergeDown" :aria-label="`Move ${label} to the bottom`" tooltip="Move to bottom" :disabled="last" data-testid="move-bottom" @click="emit('moveTo', 'bottom')" />
  </span>
</template>

<script setup lang="ts">
/**
 * Up and down for one row of a Canon list, and (when the list handles them) to the top and to the bottom, so a long list
 * is not walked one step at a time. The list offers them only while nothing narrows it (an arc or a search), so a
 * move is never ambiguous; a row at an end has the button for that end disabled, as a passage or a step does.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconArrowUp, IconChevronDown, IconChevronUp, IconMergeDown } from "@/lib/icons";

const { toEnds = false } = defineProps<{ label: string; first: boolean; last: boolean; toEnds?: boolean }>();
const emit = defineEmits<{ move: [direction: -1 | 1]; moveTo: [end: "top" | "bottom"] }>();
</script>
