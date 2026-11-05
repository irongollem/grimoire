<template>
  <div class="flex flex-col gap-3">
    <ol class="grid gap-2 text-caption text-muted-foreground sm:grid-cols-3">
      <li v-for="(step, i) in STEPS" :key="step" class="flex gap-2">
        <span class="text-label font-semibold text-foreground">{{ i + 1 }}</span>
        <span>{{ step }}</span>
      </li>
    </ol>

    <div class="flex justify-center rounded-lg border border-border bg-muted/30 p-2">
      <p v-if="failed" class="p-6 text-body text-muted-foreground" role="alert">The room's picture could not be loaded.</p>
      <div v-else-if="!size" class="p-6 text-body text-muted-foreground">Loading the picture…</div>
      <div v-else class="relative inline-block max-w-full select-none touch-none">
        <img :src="src" alt="The room's picture" draggable="false" class="block max-h-[55vh] max-w-full" />
        <!-- The drawing surface sits over the picture; it is the one focusable thing so the keys have somewhere to land. -->
        <div
          ref="surface"
          class="absolute inset-0 cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          role="group"
          tabindex="0"
          aria-label="Draw round the thing to lift. With the keyboard, the arrow keys move the rectangle and Shift with an arrow resizes it."
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
          @keydown="onKey"
        >
          <div
            v-if="rect && rect.w > 0 && rect.h > 0"
            class="absolute border-2 border-dashed border-tone-gold bg-tone-gold/15"
            :style="boxStyle"
          />
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <AppButton variant="ghost" size="sm" label="Back" :disabled="busy" @click="emit('back')" />
      <div class="flex items-center gap-2">
        <AppButton v-if="rect" variant="ghost" size="sm" label="Clear" :disabled="busy" @click="rect = null" />
        <AppButton
          variant="primary"
          size="sm"
          :label="label"
          :loading="busy"
          :disabled="!usable"
          @click="rect && emit('lift', rect)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { nudgeRect, rectFromCorners, resizeRect, type Size } from "@/lib/bookNook/liftGeometry";
import type { Rect } from "@/lib/bookNook/scene";
import { loadImage } from "./canvas";

/**
 * Lift's first step (frame 06): the room's picture, fitted, with a rectangle drawn round the thing to take out.
 * The rectangle is in the picture's own pixels. It owns the drawing and the keys; the dialog owns the price,
 * the credits and the model calls, and hears `lift` with the rectangle.
 */
const { src, label, busy = false } = defineProps<{
  src: string;
  /** The button's words, price included ("Lift · 6 credits"). */
  label: string;
  busy?: boolean;
}>();

const emit = defineEmits<{ lift: [rect: Rect]; back: [] }>();

const STEPS = [
  "Draw round it in your picture.",
  "It becomes a cut-out of its own.",
  "The gap behind it is painted in, so it can move without leaving a twin.",
];

/** Smallest rectangle worth sending, in picture pixels. */
const MIN_SIDE = 16;
const KEY_STEP = 10;

const size = ref<Size | null>(null);
const failed = ref(false);
const rect = ref<Rect | null>(null);
const surface = ref<HTMLElement | null>(null);

watch(
  () => src,
  async (url) => {
    size.value = null;
    failed.value = false;
    rect.value = null;
    try {
      const img = await loadImage(url);
      size.value = { width: img.naturalWidth, height: img.naturalHeight };
    } catch {
      failed.value = true;
    }
  },
  { immediate: true },
);

const usable = computed(() => !!rect.value && rect.value.w >= MIN_SIDE && rect.value.h >= MIN_SIDE);
const boxStyle = computed(() => {
  const r = rect.value;
  const s = size.value;
  if (!r || !s) return {};
  return { left: `${(r.x / s.width) * 100}%`, top: `${(r.y / s.height) * 100}%`, width: `${(r.w / s.width) * 100}%`, height: `${(r.h / s.height) * 100}%` };
});

let start: { x: number; y: number } | null = null;

function pointAt(event: PointerEvent): { x: number; y: number } | null {
  const box = surface.value?.getBoundingClientRect();
  const s = size.value;
  if (!box || !s || box.width === 0) return null;
  return { x: ((event.clientX - box.left) / box.width) * s.width, y: ((event.clientY - box.top) / box.height) * s.height };
}
function onDown(event: PointerEvent) {
  if (busy) return;
  start = pointAt(event);
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}
function onMove(event: PointerEvent) {
  const here = pointAt(event);
  if (!start || !here || !size.value) return;
  rect.value = rectFromCorners(start, here, size.value);
}
function onUp() {
  start = null;
}

function onKey(event: KeyboardEvent) {
  const s = size.value;
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!s || !delta || busy) return;
  event.preventDefault();
  // With nothing drawn yet an arrow starts a rectangle in the middle, a fifth of the picture across.
  const current = rect.value ?? {
    x: Math.round(s.width * 0.4),
    y: Math.round(s.height * 0.4),
    w: Math.round(s.width * 0.2),
    h: Math.round(s.height * 0.2),
  };
  rect.value = event.shiftKey
    ? resizeRect(current, delta[0] * KEY_STEP, delta[1] * KEY_STEP, s)
    : nudgeRect(current, delta[0] * KEY_STEP, delta[1] * KEY_STEP, s);
}
</script>
