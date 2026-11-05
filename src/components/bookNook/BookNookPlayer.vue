<template>
  <div ref="host" class="relative size-full overflow-hidden bg-black" role="img" :aria-label="scene.title">
    <img
      v-if="still"
      :src="still"
      :alt="scene.title"
      class="absolute inset-0 size-full object-cover"
      data-testid="nook-still"
      :class="{ invisible: showingCanvas }"
    />
    <canvas
      ref="canvasEl"
      class="absolute inset-0 size-full"
      :class="{ invisible: !showingCanvas }"
      :width="pixels.width"
      :height="pixels.height"
      aria-hidden="true"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useVisibleLoop } from "@/composables/useVisibleLoop";
import { windowFor } from "@/lib/bookNook/framing";
import { drawScene, loadImages, type Images } from "@/lib/bookNook/render";
import type { Point, Scene } from "@/lib/bookNook/scene";

/**
 * One nook, drawn live: a canvas the size of its container painted by the engine (`lib/bookNook/render.ts`),
 * with the still picture under it. The parent sizes it; it fills whatever it is given.
 *
 * It plays only while it is on screen and the tab is visible (`useVisibleLoop`), at 30 frames a second and a
 * device pixel ratio of at most 1.5. The still shows until the images are in, whenever the loop is not
 * running (off screen, paused, reduced motion) and for good if a part fails to load or drawing proves too
 * slow. The ornamental frame is drawn in full screen only. `tilt` is the viewer looking round the room;
 * while it is non-zero the picture's own breathing gives way to it.
 */
const { scene, still = null, screen, fullscreen = false, paused = false, tilt = { x: 0, y: 0 } } = defineProps<{
  scene: Scene;
  still?: string | null;
  screen: "wide" | "tall";
  fullscreen?: boolean;
  paused?: boolean;
  tilt?: Point;
}>();
const emit = defineEmits<{ error: [error: Error] }>();

/** A device pixel ratio above this buys sharpness nobody sees and costs a frame budget that is not there. */
const MAX_DPR = 1.5;
/** Median draw time over `BUDGET_FRAMES` frames above which the nook gives up and shows the still. */
const BUDGET_MS = 4;
const BUDGET_FRAMES = 60;
/** Seconds breathing takes to fade out for tilt and back, so the camera never jumps. */
const BREATHE_EASE = 0.5;
/** Tilts smaller than this count as none. */
const SETTLED = 0.01;

const host = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const size = ref({ width: 0, height: 0 });
const images = shallowRef<Images | null>(null);
const failed = ref(false);
const overBudget = ref(false);

const pixels = computed(() => {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  return { width: Math.max(1, Math.round(size.value.width * dpr)), height: Math.max(1, Math.round(size.value.height * dpr)) };
});

/** What is drawn: the same room, with its frame only when the picture is full screen. */
const drawn = computed<Scene>(() => (fullscreen ? scene : { ...scene, frame: undefined }));
const view = computed(() => windowFor(scene, screen));

const ready = computed(() => images.value !== null && size.value.width > 0 && !failed.value && !overBudget.value);
const { running } = useVisibleLoop(host, drawFrame, { paused: computed(() => paused || !ready.value) });
const showingCanvas = computed(() => running.value);

const samples: number[] = [];
let breathe = 1;
let lastSeconds = 0;
let token = 0;
watch(
  () => [drawn.value, screen] as const,
  async ([next, shape]) => {
    const mine = ++token;
    failed.value = false;
    overBudget.value = false;
    samples.length = 0;
    try {
      const loaded = await loadImages(next, (src) => src, shape);
      if (mine === token) images.value = loaded;
    } catch (error) {
      if (mine !== token) return;
      images.value = null;
      fail(error);
    }
  },
  { immediate: true },
);

function fail(error: unknown) {
  failed.value = true;
  const err = error instanceof Error ? error : new Error(String(error));
  console.warn("Book Nook: showing the still.", err);
  emit("error", err);
}

function drawFrame(seconds: number) {
  const ctx = canvasEl.value?.getContext("2d");
  const loaded = images.value;
  if (!ctx || !loaded || failed.value || overBudget.value) return;
  const dt = Math.max(0, seconds - lastSeconds);
  lastSeconds = seconds;
  const moving = Math.abs(tilt.x) > SETTLED || Math.abs(tilt.y) > SETTLED;
  breathe += ((moving ? 0 : 1) - breathe) * Math.min(1, dt / BREATHE_EASE);
  const started = performance.now();
  try {
    drawScene(ctx, drawn.value, loaded, seconds % drawn.value.loop, { window: view.value, tilt, breathe });
  } catch (error) {
    fail(error);
    return;
  }
  samples.push(performance.now() - started);
  if (samples.length >= BUDGET_FRAMES) {
    const sorted = [...samples].sort((a, b) => a - b);
    samples.length = 0;
    // The place a finer fallback goes: shed the costliest parts (cast shadows, then particles) before giving up.
    if (sorted[Math.floor(sorted.length / 2)] > BUDGET_MS) overBudget.value = true;
  }
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!host.value || typeof ResizeObserver === "undefined") return;
  observer = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect;
    if (box) size.value = { width: box.width, height: box.height };
  });
  observer.observe(host.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  token++;
});
</script>
