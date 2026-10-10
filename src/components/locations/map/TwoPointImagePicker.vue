<template>
  <div
    ref="canvas"
    class="relative w-full bg-muted rounded-md overflow-hidden select-none"
    :style="{ aspectRatio: aspectRatio || undefined }"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
  >
    <img
      v-if="mapUrl"
      ref="img"
      :src="mapUrl"
      class="block w-full h-auto pointer-events-none"
      draggable="false"
      @load="onImageLoad"
    />

    <svg
      v-if="imageReady"
      class="absolute inset-0 w-full h-full pointer-events-none"
      :viewBox="`0 0 ${naturalW} ${naturalH}`"
      preserveAspectRatio="none"
    >
      <!-- A caller's own preview (the grid lines) sits under the span line,
           drawn in the image's natural-pixel space like everything here. -->
      <slot name="overlay" :width="naturalW" :height="naturalH" />
      <!-- The span between the two handles -->
      <line
        :x1="a.x * naturalW"
        :y1="a.y * naturalH"
        :x2="b.x * naturalW"
        :y2="b.y * naturalH"
        stroke="#fbbf24"
        stroke-width="2"
        stroke-dasharray="6 4"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <button
      v-for="handle in HANDLES"
      v-show="imageReady"
      :key="handle.key"
      type="button"
      class="calib-handle"
      :class="[handle.className, { 'is-dragging': dragging === handle.key }]"
      :style="{ left: `${point(handle.key).x * 100}%`, top: `${point(handle.key).y * 100}%` }"
      :aria-label="handle.label"
      @pointerdown.prevent="startDrag(handle.key, $event)"
    >
      <span class="arm arm-h" />
      <span class="arm arm-v" />
      <span class="ring" />
      <span class="dot" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * An image with two draggable handles, A and B, for marking a span on it. The
 * grid calibration dialog and the map scale dialog (#932) both ask the DM to
 * "drag A and B across something of known size", so the picture, the handles
 * and the drag maths live here once.
 *
 * It owns no meaning for the span: the caller types the cell count or the
 * distance, and may draw its own preview into the `overlay` slot. Points are
 * fractions (0..1) of the image, the same frame as `MapPin`.
 */
import { computed, ref } from "vue";
import type { ImagePoint, ImageSize } from "@/lib/locations/mapScale";

const a = defineModel<ImagePoint>("a", { required: true });
const b = defineModel<ImagePoint>("b", { required: true });

const { mapUrl } = defineProps<{ mapUrl: string | null }>();

const emit = defineEmits<{
  /** The image has loaded and its natural size is known: the moment a caller
   *  can seed the handles from something it already has. */
  ready: [size: ImageSize];
}>();

type HandleKey = "a" | "b";

const HANDLES: ReadonlyArray<{ key: HandleKey; label: string; className: string }> = [
  { key: "a", label: "Handle A", className: "handle-a" },
  { key: "b", label: "Handle B", className: "handle-b" },
];

const img = ref<HTMLImageElement | null>(null);
const canvas = ref<HTMLDivElement | null>(null);
const imageReady = ref(false);
const naturalW = ref(0);
const naturalH = ref(0);
const dragging = ref<HandleKey | null>(null);

const aspectRatio = computed(() =>
  naturalW.value && naturalH.value ? `${naturalW.value} / ${naturalH.value}` : "",
);

function point(key: HandleKey): ImagePoint {
  return key === "a" ? a.value : b.value;
}

function onImageLoad() {
  if (!img.value) return;
  naturalW.value = img.value.naturalWidth;
  naturalH.value = img.value.naturalHeight;
  imageReady.value = true;
  emit("ready", { width: naturalW.value, height: naturalH.value });
}

function startDrag(which: HandleKey, e: PointerEvent) {
  dragging.value = which;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || !canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  if (dragging.value === "a") a.value = { x, y };
  else b.value = { x, y };
}

function onPointerUp() {
  dragging.value = null;
}
</script>

<style scoped>
/* Precision calibration handle: large invisible click target with a thin
 * crosshair and a small centre dot so the DM can see the exact pixel they
 * anchor on. The handle's centre is the anchor (matches translate(-50%)). */
.calib-handle {
  position: absolute;
  width: 2.5rem;
  height: 2.5rem;
  transform: translate(-50%, -50%);
  background: transparent;
  border: 0;
  padding: 0;
  display: block;
  cursor: grab;
  touch-action: none;
  /* keep handle above the SVG preview line */
  z-index: 2;
}
.calib-handle.is-dragging {
  cursor: grabbing;
}

.calib-handle .ring {
  position: absolute;
  inset: 0.625rem;
  border-radius: 9999px;
  border: 1.5px solid var(--handle-color);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.7), 0 0 6px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

.calib-handle .arm {
  position: absolute;
  background: var(--handle-color);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.7);
  pointer-events: none;
}
/* Crosshair arms stop short of the centre so the anchor pixel itself stays
 * unobscured — only the dot marks it. */
.calib-handle .arm-h {
  left: 0;
  right: 0;
  top: calc(50% - 0.5px);
  height: 1px;
  /* gap in the middle via two linear segments — we use a mask */
  background:
    linear-gradient(to right, var(--handle-color) 0, var(--handle-color) calc(50% - 0.25rem), transparent calc(50% - 0.25rem), transparent calc(50% + 0.25rem), var(--handle-color) calc(50% + 0.25rem));
}
.calib-handle .arm-v {
  top: 0;
  bottom: 0;
  left: calc(50% - 0.5px);
  width: 1px;
  background:
    linear-gradient(to bottom, var(--handle-color) 0, var(--handle-color) calc(50% - 0.25rem), transparent calc(50% - 0.25rem), transparent calc(50% + 0.25rem), var(--handle-color) calc(50% + 0.25rem));
}

.calib-handle .dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.1875rem;
  height: 0.1875rem;
  border-radius: 9999px;
  background: var(--handle-color);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}

/* Hover/active emphasis without obscuring the anchor */
.calib-handle:hover .ring,
.calib-handle.is-dragging .ring {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.85), 0 0 10px var(--handle-color);
}

.handle-a {
  --handle-color: #fbbf24; /* amber-400 */
}
.handle-b {
  --handle-color: #38bdf8; /* sky-400 */
}
</style>
