<template>
  <div>
    <!-- No image: dashed drop zone -->
    <div
      v-if="!modelValue"
      class="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
      :class="[
        aspectClass,
        dragOver
          ? 'border-primary/70 bg-primary/5 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
        isUploading ? 'opacity-50 pointer-events-none' : '',
      ]"
      @dragover.prevent="dragOver = true"
      @dragleave.self="dragOver = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <ImagePlus class="h-7 w-7" />
      <span class="font-fell text-xs italic text-center px-2">
        {{ isUploading ? "Uploading…" : placeholder }}
      </span>
    </div>

    <!-- Image + focal point picker -->
    <template v-else-if="showFocalPoint">
      <FocalPointPicker
        :src="modelValue"
        :model-value="focalPoint ?? null"
        @update:model-value="emit('update:focalPoint', $event)"
      />
      <div
        class="flex items-center gap-3 mt-1.5"
        @dragover.prevent="dragOver = true"
        @dragleave.self="dragOver = false"
        @drop.prevent="onDrop"
      >
        <button
          type="button"
          class="font-cinzel text-[10px] tracking-wider transition-colors"
          :class="dragOver ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
          :disabled="isUploading"
          @click="fileInput?.click()"
        >
          {{ isUploading ? "Uploading…" : "Change image" }}
        </button>
        <span class="text-muted-foreground/40 text-xs">·</span>
        <button
          type="button"
          class="font-cinzel text-[10px] text-destructive hover:opacity-80 transition-opacity tracking-wider"
          @click="removeImage"
        >
          Remove
        </button>
      </div>
    </template>

    <!-- Image, no focal point: thumbnail with drag-drop -->
    <template v-else>
      <div
        class="relative rounded-lg border overflow-hidden cursor-pointer group transition-colors"
        :class="[
          aspect !== 'auto' ? aspectClass : '',
          dragOver ? 'border-primary/70' : 'border-border hover:border-primary/50',
        ]"
        @dragover.prevent="dragOver = true"
        @dragleave.self="dragOver = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
      >
        <img :src="modelValue" alt="" :class="aspect === 'auto' ? 'w-full h-auto block' : 'w-full h-full object-cover'" />
        <div
          class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <span class="font-fell text-white text-xs italic">
            {{ isUploading ? "Uploading…" : "Change" }}
          </span>
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

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFileSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ImagePlus } from "lucide-vue-next";
import { useImageUpload } from "@/composables/useImageUpload";
import FocalPointPicker from "./FocalPointPicker.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    focalPoint?: { x: number; y: number } | null;
    bucket?: string;
    aspect?: "portrait" | "landscape" | "square" | "auto";
    showFocalPoint?: boolean;
    placeholder?: string;
  }>(),
  {
    bucket: "asset-images",
    aspect: "portrait",
    showFocalPoint: false,
    placeholder: "Drop image or click to upload",
    focalPoint: null,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
  "update:focalPoint": [value: { x: number; y: number } | null];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const { isUploading, upload, remove } = useImageUpload(props.bucket);

const aspectClass = computed(() => {
  const map = { portrait: "aspect-3/4", landscape: "aspect-video", square: "aspect-square", auto: "min-h-24" } as const;
  return map[props.aspect];
});

async function handleFile(file: File) {
  const oldUrl = props.modelValue;
  const url = await upload(file);
  if (!url) return;
  if (oldUrl) remove(oldUrl);
  emit("update:modelValue", url);
  if (props.showFocalPoint) emit("update:focalPoint", null);
}

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (fileInput.value) fileInput.value.value = "";
  await handleFile(file);
}

async function onDrop(e: DragEvent) {
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  await handleFile(file);
}

function removeImage() {
  if (props.modelValue) remove(props.modelValue);
  emit("update:modelValue", null);
  if (props.showFocalPoint) emit("update:focalPoint", null);
}
</script>
