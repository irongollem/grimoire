<template>
  <AppButton
    variant="subtle"
    size="body"
    class="h-auto min-h-11 flex-col gap-1 px-1 py-2 cursor-grab"
    :draggable="!disabled"
    :disabled="disabled"
    :tooltip="tooltip"
    :data-testid="`kit-tile-${label}`"
    @click="emit('place')"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend')"
  >
    <component :is="icon" class="size-4 shrink-0 text-primary" aria-hidden="true" />
    <span class="text-caption leading-tight text-foreground">{{ label }}</span>
  </AppButton>
</template>

<script setup lang="ts">
/** One featured block of the book kit: dragged onto the page, or clicked to land at the caret. */
import type { Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";

defineProps<{
  label: string;
  icon: Component;
  tooltip?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ place: []; dragstart: [event: DragEvent]; dragend: [] }>();
</script>
