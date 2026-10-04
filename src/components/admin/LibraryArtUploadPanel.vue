<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { ref } from "vue";
import { ImagePlusIcon } from "@lucide/vue";

// ── Props & emits ─────────────────────────────────────────────────────────────

const {
  uploading = false,
  progressDone = 0,
  progressTotal = 0,
  dragging = false,
} = defineProps<{
  uploading?: boolean;
  progressDone?: number;
  progressTotal?: number;
  dragging?: boolean;
}>();

const emit = defineEmits<{
  files: [files: FileList];
  "update:dragging": [value: boolean];
}>();

// ── Internal file input ref ───────────────────────────────────────────────────

const fileInputRef = ref<HTMLInputElement | null>(null);

function handleInputChange(event: Event) {
  const files = (event.target as HTMLInputElement).files;
  if (files?.length) emit("files", files);
  (event.target as HTMLInputElement).value = "";
}

function onDragEnter(event: DragEvent) {
  event.preventDefault();
  emit("update:dragging", true);
}
function onDragOver(event: DragEvent) {
  event.preventDefault();
}
function onDragLeave(event: DragEvent) {
  const el = event.currentTarget as HTMLElement;
  if (!el.contains(event.relatedTarget as Node)) emit("update:dragging", false);
}
function onDrop(event: DragEvent) {
  event.preventDefault();
  emit("update:dragging", false);
  const files = event.dataTransfer?.files;
  if (files?.length) emit("files", files);
}
</script>

<template>
  <div
    class="relative rounded-lg border-2 border-dashed transition-colors p-6 flex flex-col items-center justify-center gap-3 min-h-36 cursor-pointer"
    :class="
      dragging
        ? 'border-primary bg-primary/5'
        : 'border-border hover:border-primary/50'
    "
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @click="fileInputRef?.click()"
  >
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      multiple
      class="sr-only"
      @change="handleInputChange"
    />

    <template v-if="uploading">
      <BannerLoader class="h-10" />
      <p class="text-heading-sm text-primary">
        Converting {{ progressDone }}&thinsp;/&thinsp;{{ progressTotal }}…
      </p>
      <p class="text-caption text-muted-foreground italic">
        Converting to WebP and uploading
      </p>
    </template>
    <template v-else>
      <ImagePlusIcon class="h-8 w-8 text-muted-foreground" />
      <p class="text-heading-sm text-foreground">
        Drop images here or tap to pick
      </p>
      <p class="text-caption text-muted-foreground italic text-center">
        Select as many as you like. Each is converted to WebP and held in
        staging until you assign it on desktop.
      </p>
    </template>
  </div>
</template>
