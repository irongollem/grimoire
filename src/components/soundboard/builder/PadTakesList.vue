<template>
  <ul class="space-y-1" aria-label="Takes">
    <li
      v-for="(take, index) in takes"
      :key="take.id"
      class="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
      :class="overIndex === index ? 'border-primary' : ''"
      draggable="true"
      @dragstart="onDragStart($event, index)"
      @dragover.prevent="overIndex = index"
      @dragleave="overIndex = null"
      @drop.prevent="onDrop(index)"
      @dragend="overIndex = null"
    >
      <IconDrag class="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
      <AppButton
        variant="ghost"
        size="icon-xs"
        icon-size="md"
        :icon="take.playing ? IconStop : IconPlay"
        :aria-label="take.playing ? `Stop ${take.name}` : `Preview ${take.name}`"
        @click="emit('preview', take.id)"
      />
      <span class="min-w-0 flex-1 truncate text-body">{{ take.name }}</span>
      <AppButton
        variant="ghost"
        size="icon-xs"
        icon-size="md"
        :icon="IconClose"
        :disabled="takes.length < 2"
        :aria-label="`Remove ${take.name}`"
        :tooltip="takes.length < 2 ? 'A pad keeps at least one sound' : 'Remove this take'"
        @click="emit('remove', take.id)"
      />
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconClose, IconDrag, IconPlay, IconStop } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import { moveId } from "./padSettingsModel";

export interface TakeRow {
  id: string;
  name: string;
  playing: boolean;
}

const { takes } = defineProps<{ takes: readonly TakeRow[] }>();
const emit = defineEmits<{ preview: [takeId: string]; remove: [takeId: string]; reorder: [takeIds: string[]] }>();

const dragFrom = ref<number | null>(null);
const overIndex = ref<number | null>(null);

function onDragStart(event: DragEvent, index: number) {
  dragFrom.value = index;
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDrop(to: number) {
  const from = dragFrom.value;
  dragFrom.value = null;
  overIndex.value = null;
  if (from === null || from === to) return;
  emit("reorder", moveId(takes.map((t) => t.id), from, to));
}
</script>
