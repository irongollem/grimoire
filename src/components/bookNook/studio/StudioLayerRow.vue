<template>
  <div
    class="flex items-center gap-1"
    :class="{ 'opacity-50': hidden }"
    :draggable="draggable"
    @dragstart="emit('dragstart', $event)"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
  >
    <AppButton
      variant="tool"
      size="sm"
      block
      :active="selected"
      class="min-w-0 flex-1 justify-start gap-2 text-left"
      :aria-pressed="selected"
      @click="emit('select')"
    >
      <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/50 text-muted-foreground">
        <img v-if="thumb" :src="thumb" alt="" draggable="false" class="size-full object-contain" />
        <component :is="icon" v-else class="size-4" aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate">{{ name }}</span>
        <span class="block text-label uppercase text-muted-foreground">{{ word }}</span>
      </span>
    </AppButton>
    <AppButton
      variant="ghost"
      fill="muted"
      size="icon-sm"
      :icon="hidden ? IconHide : IconReveal"
      :aria-label="hidden ? `Show ${name} in the studio` : `Hide ${name} in the studio`"
      :tooltip="hidden ? 'Hidden here only' : 'Hide here only'"
      :aria-pressed="hidden"
      @click="emit('toggle')"
    />
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconHide, IconReveal } from "@/lib/icons";

/**
 * One row of the studio's layer list: thumbnail (or an icon for a touch), name, a small-caps word, and an eye
 * that hides the thing in the studio only. A cut-out row can be dragged onto another of its depth.
 */
const { name, word, thumb = null, icon, selected = false, hidden = false, draggable = false } = defineProps<{
  name: string;
  word: string;
  thumb?: string | null;
  icon: Component;
  selected?: boolean;
  hidden?: boolean;
  draggable?: boolean;
}>();

const emit = defineEmits<{
  select: [];
  toggle: [];
  dragstart: [event: DragEvent];
  dragover: [event: DragEvent];
  drop: [event: DragEvent];
}>();
</script>
