<template>
  <!-- Over the stage: everything outside the box is dimmed, and the box has a handle on every corner (and edge, in Free). -->
  <div ref="area" class="absolute inset-0 overflow-hidden" data-testid="crop-area">
    <div
      class="absolute cursor-move touch-none border border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]"
      :style="boxStyle"
      data-testid="crop-box"
      @pointerdown.stop.prevent="start('move', $event)"
      @pointermove="move"
      @pointerup="end"
      @pointercancel="end"
    >
      <!-- Thirds, to line the picture up by. -->
      <span class="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/35" aria-hidden="true" />
      <span class="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/35" aria-hidden="true" />
      <span class="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/35" aria-hidden="true" />
      <span class="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/35" aria-hidden="true" />

      <span
        v-for="h in handles"
        :key="h.handle"
        class="absolute size-3 rounded-sm border border-black/50 bg-white"
        :class="[h.position, h.cursor, 'touch-none']"
        :data-testid="`crop-handle-${h.handle}`"
        @pointerdown.stop.prevent="start(h.handle, $event)"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="end"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The crop box on the workbench's stage (#1176 story 9c). It only draws the
 * box and reports a drag as fractions of the picture; what a drag may do (stay
 * inside, keep a shape) is cropBox.ts, applied by the workbench.
 */
import { computed, ref } from "vue";
import type { CropHandle, CropRect } from "@/scriptorium/illuminator/lib/cropBox";

const { crop, locked } = defineProps<{
  crop: CropRect;
  /** A shape is set: only the corners resize, so the shape cannot be broken from an edge. */
  locked: boolean;
}>();

const emit = defineEmits<{ drag: [handle: CropHandle, start: CropRect, dx: number, dy: number] }>();

const area = ref<HTMLElement | null>(null);

const boxStyle = computed(() => ({
  left: `${crop.x * 100}%`,
  top: `${crop.y * 100}%`,
  width: `${crop.w * 100}%`,
  height: `${crop.h * 100}%`,
}));

const ALL: { handle: CropHandle; position: string; cursor: string }[] = [
  { handle: "nw", position: "-left-1.5 -top-1.5", cursor: "cursor-nwse-resize" },
  { handle: "n", position: "-top-1.5 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize" },
  { handle: "ne", position: "-right-1.5 -top-1.5", cursor: "cursor-nesw-resize" },
  { handle: "e", position: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
  { handle: "se", position: "-bottom-1.5 -right-1.5", cursor: "cursor-nwse-resize" },
  { handle: "s", position: "-bottom-1.5 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize" },
  { handle: "sw", position: "-bottom-1.5 -left-1.5", cursor: "cursor-nesw-resize" },
  { handle: "w", position: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
];
const handles = computed(() => (locked ? ALL.filter((h) => h.handle.length === 2) : ALL));

let drag: { handle: CropHandle; start: CropRect; x: number; y: number } | null = null;

function start(handle: CropHandle, e: PointerEvent) {
  drag = { handle, start: { ...crop }, x: e.clientX, y: e.clientY };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function move(e: PointerEvent) {
  const box = area.value?.getBoundingClientRect();
  if (!drag || !box || box.width === 0 || box.height === 0) return;
  emit("drag", drag.handle, drag.start, (e.clientX - drag.x) / box.width, (e.clientY - drag.y) / box.height);
}

function end() {
  drag = null;
}
</script>
