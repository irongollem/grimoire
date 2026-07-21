<template>
  <div class="flex flex-col gap-3 lg:min-h-0 lg:overflow-hidden">

    <!-- Drop zone -->
    <div
      v-if="!hasImage"
      class="relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-card transition-colors min-h-80 lg:flex-1 cursor-pointer"
      :class="isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'"
      @click="emit('pick')"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <IconImage class="h-10 w-10 text-muted-foreground/40" />
      <div class="text-center">
        <p class="font-cinzel text-sm font-semibold text-foreground">Drop an image here</p>
        <p class="text-body text-muted-foreground mt-0.5">or click to browse — PNG, JPG, WebP</p>
      </div>
    </div>

    <!-- Canvas preview -->
    <template v-else>
      <!-- On desktop: flex-1 + min-h-0 lets the canvas fill available height -->
      <div
        class="relative rounded-xl overflow-hidden lg:flex-1 lg:min-h-0 flex items-center justify-center"
        style="background: repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 0 0 / 1.25rem 1.25rem;"
      >
        <canvas
          ref="canvasEl"
          class="block max-w-full lg:max-h-full"
          :class="cursorClass"
          @click="emit('canvas-click', $event)"
          @pointerdown="emit('brush-pointer-down', $event)"
          @pointermove="emit('brush-pointer-move', $event)"
          @pointerup="emit('brush-pointer-up')"
          @pointercancel="emit('brush-pointer-up')"
          @pointerenter="emit('brush-pointer-enter')"
          @pointerleave="emit('brush-pointer-leave')"
          @contextmenu.prevent
        />
      </div>
      <!-- Brush cursor circle — teleported to body to escape overflow-hidden -->
      <Teleport to="body">
        <div
          v-if="brushMode && brushCursorVisible"
          class="pointer-events-none fixed rounded-full border border-white/80 mix-blend-difference"
          :style="{
            left: `${brushCursorClientX}px`,
            top: `${brushCursorClientY}px`,
            width: `${brushCursorDiameter}px`,
            height: `${brushCursorDiameter}px`,
            transform: 'translate(-50%, -50%)',
            zIndex: 9999,
          }"
        />
      </Teleport>

      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="text-label-lg text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          @click="emit('replace')"
        >Replace image</button>
        <span class="text-muted-foreground/40 text-xs">·</span>
        <span class="text-caption text-muted-foreground">
          {{ filename }} · {{ imageWidth }}×{{ imageHeight }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconImage } from "@/lib/icons";

const {
  hasImage,
  filename = "image",
  imageWidth = 0,
  imageHeight = 0,
  cursorClass = "",
  brushMode = false,
  brushCursorVisible = false,
  brushCursorClientX = 0,
  brushCursorClientY = 0,
  brushCursorDiameter = 0,
} = defineProps<{
  hasImage: boolean;
  filename?: string;
  imageWidth?: number;
  imageHeight?: number;
  cursorClass?: string;
  brushMode?: boolean;
  brushCursorVisible?: boolean;
  brushCursorClientX?: number;
  brushCursorClientY?: number;
  brushCursorDiameter?: number;
}>();

const emit = defineEmits<{
  pick: [];
  replace: [];
  drop: [event: DragEvent];
  'canvas-click': [event: MouseEvent];
  'brush-pointer-down': [event: PointerEvent];
  'brush-pointer-move': [event: PointerEvent];
  'brush-pointer-up': [];
  'brush-pointer-enter': [];
  'brush-pointer-leave': [];
}>();

const isDragging = ref(false);
const canvasEl = ref<HTMLCanvasElement | null>(null);

function onDrop(e: DragEvent) {
  isDragging.value = false;
  emit('drop', e);
}

defineExpose({ canvasEl });
</script>
