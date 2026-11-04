<template>
  <li
    class="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-secondary/40"
    :class="canPlace ? 'cursor-pointer' : 'cursor-grab'"
    draggable="true"
    :tabindex="canPlace ? 0 : undefined"
    @dragstart="onDragStart"
    @click="onPlace"
    @keydown.enter.self.prevent="onPlace"
  >
    <span class="h-2 w-2 shrink-0 rounded-full" :class="DOT[row.category]" aria-hidden="true" />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-body text-foreground">{{ row.name }}</span>
      <span class="block truncate text-caption-sm text-muted-foreground">
        {{ row.meta }}<template v-if="onPage"> · on this page</template>
      </span>
    </span>
    <AppButton
      variant="ghost"
      size="icon-xs"
      icon-size="md"
      :icon="playing ? IconStop : IconPlay"
      :tooltip="playing ? 'Stop preview' : 'Preview'"
      :aria-label="playing ? `Stop ${row.name}` : `Preview ${row.name}`"
      @click.stop="emit('preview')"
    />
    <AppButton
      v-if="row.playlist"
      variant="ghost"
      size="icon-xs"
      icon-size="md"
      :icon="IconEdit"
      :aria-label="`Edit ${row.name}`"
      tooltip="Edit"
      @click.stop="emit('edit')"
    />
  </li>
</template>

<script setup lang="ts">
import { IconEdit, IconPlay, IconStop } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { SoundCategory } from "@/types/sound.types";
import { dragTypeFor, type LibraryRow } from "./libraryRows";

const { row, onPage, canPlace, playing } = defineProps<{
  row: LibraryRow;
  onPage: boolean;
  canPlace: boolean;
  playing: boolean;
}>();
const emit = defineEmits<{ place: []; preview: []; edit: [] }>();

const DOT: Record<SoundCategory, string> = {
  ambient: "bg-tone-success",
  music: "bg-gold-400",
  effects: "bg-tone-info",
};

function onDragStart(event: DragEvent) {
  const data = event.dataTransfer;
  if (data === null) return;
  data.setData(dragTypeFor(row.placement), row.placement.id);
  data.setData("text/plain", row.name);
  data.effectAllowed = "copy";
}

// A click places only into a selected empty slot; otherwise the row is for dragging.
function onPlace() {
  if (canPlace) emit("place");
}
</script>
