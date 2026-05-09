<template>
  <div class="relative">
    <!-- No image: dashed drop zone — label activates file input natively (iOS-safe) -->
    <label
      v-if="!modelValue"
      :for="inputId"
      class="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors"
      :class="[
        aspectClass,
        dragOver
          ? 'border-primary/70 bg-primary/5 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
        isUploading ? 'opacity-50 pointer-events-none cursor-default' : 'cursor-pointer',
      ]"
      @dragenter.prevent
      @dragover.prevent="dragOver = true"
      @dragleave.self="dragOver = false"
      @drop.prevent="onDrop"
    >
      <IconAddImage class="h-7 w-7" />
      <span class="font-fell text-xs italic text-center px-2">
        {{ isUploading ? "Uploading…" : placeholder }}
      </span>
    </label>

    <!-- Image + focal point picker -->
    <template v-else-if="showFocalPoint">
      <div
        class="rounded-lg transition-shadow"
        :class="dragOver ? 'ring-2 ring-primary/70' : ''"
        @dragenter.prevent
        @dragover.prevent="dragOver = true"
        @dragleave.self="dragOver = false"
        @drop.prevent="onDrop"
      >
        <FocalPointPicker
          :src="modelValue"
          :model-value="focalPoint ?? null"
          @update:model-value="emit('update:focalPoint', $event)"
        />
        <div class="flex items-center gap-3 mt-1.5">
          <label
            :for="inputId"
            class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            :class="isUploading ? 'opacity-50 pointer-events-none cursor-default' : 'cursor-pointer'"
          >
            {{ isUploading ? "Uploading…" : "Change image" }}
          </label>
          <span class="text-muted-foreground/40 text-xs">·</span>
          <button
            type="button"
            class="font-cinzel text-[10px] text-destructive hover:opacity-80 transition-opacity tracking-wider"
            @click="removeImage"
          >
            Remove
          </button>
        </div>
      </div>
    </template>

    <!-- Image, no focal point: overlay label on thumbnail -->
    <template v-else>
      <div
        class="relative rounded-lg border overflow-hidden group transition-colors"
        :class="[
          aspect !== 'auto' ? aspectClass : '',
          dragOver ? 'border-primary/70' : 'border-border hover:border-primary/50',
        ]"
        @dragenter.prevent
        @dragover.prevent="dragOver = true"
        @dragleave.self="dragOver = false"
        @drop.prevent="onDrop"
      >
        <img :src="modelValue" alt="" :class="aspect === 'auto' ? 'w-full h-auto block' : 'w-full h-full object-cover'" />
        <label
          v-if="!isUploading"
          :for="inputId"
          class="absolute inset-0 cursor-pointer bg-black/50 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <span class="font-fell text-white text-xs italic">Change</span>
        </label>
        <div v-else class="absolute inset-0 bg-black/50 flex items-center justify-center">
          <span class="font-fell text-white text-xs italic">Uploading…</span>
        </div>
      </div>
      <button
        type="button"
        class="mt-1 font-cinzel text-[10px] text-muted-foreground/50 hover:text-destructive tracking-wider transition-colors"
        @click="removeImage"
      >
        Remove
      </button>
    </template>

    <p v-if="uploadError" class="text-destructive font-fell text-xs mt-1">{{ uploadError }}</p>

    <input
      :id="inputId"
      ref="fileInput"
      type="file"
      accept="image/*"
      class="sr-only top-0! left-0!"
      :disabled="isUploading"
      @change="onFileSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useId } from "vue";
import { IconAddImage } from '@/lib/icons';
import { useImageUpload } from "@/composables/useImageUpload";
import FocalPointPicker from "./FocalPointPicker.vue";

const {
  modelValue,
  focalPoint = null,
  bucket = "asset-images",
  aspect = "portrait",
  showFocalPoint = false,
  placeholder = "Drop image or click to upload",
} = defineProps<{
  modelValue: string | null;
  focalPoint?: { x: number; y: number } | null;
  bucket?: string;
  aspect?: "portrait" | "landscape" | "square" | "auto";
  showFocalPoint?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
  "update:focalPoint": [value: { x: number; y: number } | null];
}>();

const inputId = useId();
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const { isUploading, uploadError, upload, remove } = useImageUpload(bucket);

const aspectClass = computed(() => {
  const map = { portrait: "aspect-3/4", landscape: "aspect-video", square: "aspect-square", auto: "min-h-24" } as const;
  return map[aspect];
});

async function handleFile(file: File) {
  const oldUrl = modelValue;
  const url = await upload(file);
  if (!url) return;
  if (oldUrl) remove(oldUrl);
  emit("update:modelValue", url);
  if (showFocalPoint) emit("update:focalPoint", null);
}

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    await handleFile(file);
  } finally {
    if (fileInput.value) fileInput.value.value = "";
  }
}

async function onDrop(e: DragEvent) {
  dragOver.value = false;

  // Case 1: file dragged from OS
  const file = e.dataTransfer?.files?.[0];
  if (file?.type.startsWith("image/")) {
    await handleFile(file);
    return;
  }

  // Case 2: image element dragged from another browser tab/window
  // dataTransfer.files is empty in this case; the URL lives in text/uri-list
  const uriList = e.dataTransfer?.getData("text/uri-list") ?? "";
  const url = uriList.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
  if (!url) return;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) throw new Error("Not an image");
    const filename = url.split("/").pop()?.split("?")[0] || "image";
    await handleFile(new File([blob], filename, { type: blob.type }));
  } catch {
    uploadError.value = "Can't fetch this image directly — save it to disk first, then drag the file";
  }
}

function removeImage() {
  if (modelValue) remove(modelValue);
  emit("update:modelValue", null);
  if (showFocalPoint) emit("update:focalPoint", null);
}
</script>
