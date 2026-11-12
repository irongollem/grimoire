<template>
  <div ref="holder" class="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-muted/40 p-6">
    <div
      v-if="loadError"
      role="alert"
      class="text-body text-muted-foreground"
    >{{ loadError }}</div>
    <div v-else-if="!ready" class="text-body text-muted-foreground" role="status">Opening the picture…</div>

    <!-- The picture, twice, one over the other: the original, and the edits clipped to the right of the divider. -->
    <div
      v-show="ready"
      class="relative shrink-0 select-none shadow-lg"
      :style="{ width: `${display.width}px`, height: `${display.height}px`, background: CHECKER }"
      data-testid="workbench-stage"
    >
      <canvas
        ref="beforeEl"
        class="absolute inset-0 size-full"
        :style="{ clipPath: `inset(0 ${100 - effectivePos}% 0 0)` }"
        aria-label="The original picture"
      />
      <canvas
        ref="afterEl"
        class="absolute inset-0 size-full"
        :style="{ clipPath: `inset(0 0 0 ${effectivePos}%)` }"
        aria-label="The picture with your edits"
      />

      <!-- Pointer layer: focus point and brush strokes, wherever the divider is. -->
      <div
        class="absolute inset-0"
        :class="cursorClass"
        data-testid="workbench-pointer-layer"
        @click="emit('canvas-click', $event)"
        @pointerdown="emit('brush-down', $event)"
        @pointermove="emit('brush-move', $event)"
        @pointerup="emit('brush-up')"
        @pointercancel="emit('brush-up')"
        @pointerenter="emit('brush-enter')"
        @pointerleave="emit('brush-leave')"
        @contextmenu.prevent
      />

      <!-- A tool's own overlay: the crop box. -->
      <slot />

      <template v-if="ready">
        <span class="pointer-events-none absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-eyebrow uppercase text-foreground">Before</span>
        <span class="pointer-events-none absolute bottom-2 right-2 rounded-sm bg-background/80 px-2 py-0.5 text-eyebrow uppercase text-primary">After</span>
        <div
          v-if="!compareOff"
          class="absolute inset-y-0 w-8 -translate-x-1/2 cursor-ew-resize touch-none"
          :style="{ left: `${effectivePos}%` }"
          data-testid="workbench-divider"
          @pointerdown.stop.prevent="startDrag"
          @pointermove="onDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
        >
          <div class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" aria-hidden="true" />
        </div>
      </template>
    </div>

    <div v-if="ready" class="mt-4 flex w-full max-w-md flex-col items-center gap-1">
      <label class="flex w-full items-center gap-3 text-caption text-muted-foreground">
        Compare
        <input
          type="range"
          min="0"
          max="100"
          class="min-w-0 flex-1 accent-primary"
          aria-label="Before and after divider"
          :disabled="compareOff"
          :value="comparePos"
          @input="emit('update:comparePos', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <span class="text-caption text-muted-foreground">Drag the divider, or hold B to see the original</span>
    </div>

    <!-- The brush's circle follows the pointer. Teleported out so no overflow clips it. -->
    <Teleport to="body">
      <div
        v-if="brushCursor.visible"
        class="pointer-events-none fixed z-[9999] rounded-full border border-white/80 mix-blend-difference"
        :style="{ left: `${brushCursor.x}px`, top: `${brushCursor.y}px`, width: `${brushCursor.diameter}px`, height: `${brushCursor.diameter}px`, transform: 'translate(-50%, -50%)' }"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/**
 * The workbench's stage (#1176 frame 12): the picture, with a before/after
 * divider you drag. It only draws and reports; the render and the brush are
 * the composable's. The two canvases are exposed so it can draw into them.
 */
import { computed, ref } from "vue";
import { useElementSize } from "@vueuse/core";

const CHECKER = "repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 0 0 / 1.25rem 1.25rem";
/** Room kept round the picture for the compare slider under it. */
const CHROME_PX = 120;
const PAD_PX = 48;

const { size, comparePos, showOriginal, compareOff = false, cursorClass = "", loadError = "", brushCursor } = defineProps<{
  /** The preview's pixel size; zero until the picture has loaded. */
  size: { width: number; height: number };
  comparePos: number;
  /** Held B: the original in full. */
  showOriginal: boolean;
  /** Painting and picking a focus point want the whole edited picture, so the divider steps aside. */
  compareOff?: boolean;
  cursorClass?: string;
  loadError?: string;
  brushCursor: { visible: boolean; x: number; y: number; diameter: number };
}>();

const emit = defineEmits<{
  "update:comparePos": [value: number];
  "canvas-click": [event: MouseEvent];
  "brush-down": [event: PointerEvent];
  "brush-move": [event: PointerEvent];
  "brush-up": [];
  "brush-enter": [];
  "brush-leave": [];
}>();

const holder = ref<HTMLElement | null>(null);
const beforeEl = ref<HTMLCanvasElement | null>(null);
const afterEl = ref<HTMLCanvasElement | null>(null);
const { width: holderW, height: holderH } = useElementSize(holder);

const ready = computed(() => size.width > 0 && size.height > 0);
/** Held B puts the divider all the way over: the whole picture is the original. */
const effectivePos = computed(() => (showOriginal ? 100 : compareOff ? 0 : comparePos));

/** The preview fitted into the room there is, never larger than it was drawn. */
const display = computed(() => {
  if (!ready.value) return { width: 0, height: 0 };
  const room = { w: Math.max(80, holderW.value - PAD_PX), h: Math.max(80, holderH.value - PAD_PX - CHROME_PX) };
  const scale = Math.min(1, room.w / size.width, room.h / size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
});

let dragging = false;
function startDrag(e: PointerEvent) {
  dragging = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onDrag(e: PointerEvent) {
  const box = afterEl.value?.getBoundingClientRect();
  if (!dragging || !box || box.width === 0) return;
  emit("update:comparePos", Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100)));
}
function endDrag() {
  dragging = false;
}

defineExpose({ beforeEl, afterEl });
</script>
