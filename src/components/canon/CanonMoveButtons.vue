<template>
  <span class="relative z-20 flex shrink-0 items-center gap-0.5" data-testid="move-buttons">
    <AppButton variant="ghost" size="icon-sm" :icon="IconChevronUp" :aria-label="`Move ${label} up`" :disabled="first" @click="emit('move', -1)" />
    <AppButton variant="ghost" size="icon-sm" :icon="IconChevronDown" :aria-label="`Move ${label} down`" :disabled="last" @click="emit('move', 1)" />
  </span>
</template>

<script setup lang="ts">
/**
 * Up and down for one row of a Canon list. The list offers them only while nothing narrows it (an arc or a search), so a
 * move is never ambiguous; a row at an end has the button for that end disabled, as a passage or a step does.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";

defineProps<{ label: string; first: boolean; last: boolean }>();
const emit = defineEmits<{ move: [direction: -1 | 1] }>();
</script>
