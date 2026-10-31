<template>
  <!-- The grid laid over a picture, for the DM to line up (canvas frames 06 and 07). The picture is whatever the
       slot holds, drawn to fill this box with `object-fit: contain`; the amber grid is an SVG in the picture's own
       pixels over it, so the two cannot disagree about where a square is. -->
  <div
    ref="frameEl"
    class="relative size-full select-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
    tabindex="0"
    role="application"
    aria-label="Grid over the picture. Drag to line it up; arrow keys nudge it a pixel."
    @keydown="onKey"
  >
    <slot />
    <svg
      ref="svgEl"
      class="absolute inset-0 size-full touch-none"
      :class="locked ? 'cursor-default' : boxMode ? 'cursor-crosshair' : 'cursor-move'"
      :viewBox="`0 0 ${natural.width} ${natural.height}`"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
    >
      <!-- Amber on any picture: the same hue the old calibration dialog drew. -->
      <line
        v-for="x in lines.xs"
        :key="`v${x}`"
        :x1="x" y1="0" :x2="x" :y2="natural.height"
        stroke="#fbbf24" stroke-width="1" :stroke-opacity="opacity" vector-effect="non-scaling-stroke"
      />
      <line
        v-for="y in lines.ys"
        :key="`h${y}`"
        x1="0" :y1="y" :x2="natural.width" :y2="y"
        stroke="#fbbf24" stroke-width="1" :stroke-opacity="opacity" vector-effect="non-scaling-stroke"
      />
      <rect
        v-if="box"
        :x="Math.min(box.x0, box.x1)" :y="Math.min(box.y0, box.y1)"
        :width="Math.abs(box.x1 - box.x0)" :height="Math.abs(box.y1 - box.y0)"
        fill="#fbbf24" fill-opacity="0.2" stroke="#fbbf24" stroke-width="2" vector-effect="non-scaling-stroke"
      />
    </svg>
    <p
      v-if="hint"
      data-slip
      class="pointer-events-none absolute bottom-3 left-3 max-w-[min(30rem,calc(100%-1.5rem))] rounded-md border border-border bg-card/95 px-3 py-1.5 text-caption text-foreground shadow-md"
    >
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  calibrationFromBox,
  clientToImage,
  gridLines,
  shiftGrid,
  type ImageSize,
} from "@/lib/mapBring/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

const { natural, boxMode = false, locked = false, hint } = defineProps<{
  /** The picture's size in pixels: the grid is kept in its frame. */
  natural: ImageSize;
  /** Dragging draws a box over one square instead of moving the grid. */
  boxMode?: boolean;
  hint?: string;
  /** The grid is a fact of the file (Universal VTT) and nothing to line up: it is drawn but not moved. */
  locked?: boolean;
}>();

const calibration = defineModel<GridCalibration>({ required: true });

const emit = defineEmits<{ "box-done": [] }>();

const frameEl = ref<HTMLElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);

const lines = computed(() => gridLines(calibration.value, natural));
// Stronger than play's faint grid: this one is being aligned by eye against a picture.
const LINE_UP_OPACITY = 0.7;
const opacity = LINE_UP_OPACITY;

type Drag =
  | { kind: "grid"; from: { x: number; y: number }; start: GridCalibration }
  | { kind: "box"; from: { x: number; y: number } };
let drag: Drag | null = null;
const box = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

function imagePoint(ev: PointerEvent): { x: number; y: number } {
  const svg = svgEl.value;
  if (!svg) throw new Error("The grid overlay is not mounted");
  return clientToImage(svg.getBoundingClientRect(), natural, ev.clientX, ev.clientY);
}

function onDown(ev: PointerEvent): void {
  if (locked || ev.button !== 0) return;
  const from = imagePoint(ev);
  svgEl.value?.setPointerCapture(ev.pointerId);
  frameEl.value?.focus();
  if (boxMode) {
    drag = { kind: "box", from };
    box.value = { x0: from.x, y0: from.y, x1: from.x, y1: from.y };
  } else {
    drag = { kind: "grid", from, start: calibration.value };
  }
}

function onMove(ev: PointerEvent): void {
  if (!drag) return;
  const here = imagePoint(ev);
  if (drag.kind === "box") {
    box.value = { x0: drag.from.x, y0: drag.from.y, x1: here.x, y1: here.y };
  } else {
    calibration.value = shiftGrid(drag.start, natural, here.x - drag.from.x, here.y - drag.from.y);
  }
}

function onUp(ev: PointerEvent): void {
  if (drag?.kind === "box" && box.value) {
    const next = calibrationFromBox({ ...box.value, x1: imagePoint(ev).x, y1: imagePoint(ev).y }, natural);
    // A box too small to be a square is a slip; stay in box mode so the next try works.
    if (next) {
      calibration.value = { ...calibration.value, ...next };
      emit("box-done");
    }
  }
  onCancel();
}

function onCancel(): void {
  drag = null;
  box.value = null;
}

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function onKey(ev: KeyboardEvent): void {
  const step = NUDGE[ev.key];
  if (locked || !step) return;
  ev.preventDefault();
  const px = ev.shiftKey ? 10 : 1;
  calibration.value = shiftGrid(calibration.value, natural, step[0] * px, step[1] * px);
}
</script>
