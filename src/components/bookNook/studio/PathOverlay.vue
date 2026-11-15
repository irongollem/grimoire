<template>
  <div class="pointer-events-none absolute inset-0" data-testid="path-overlay">
    <svg
      ref="svg"
      class="absolute inset-0 size-full touch-none"
      :class="drawing ? 'pointer-events-auto cursor-crosshair' : ''"
      :viewBox="`0 0 ${size.width} ${size.height}`"
      @pointerdown.stop="onDown"
      @dblclick.stop="onDouble"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <!-- The curve the engine follows through the points (frame 05c: gold, dashed), never straight segments. -->
      <path v-if="curve" :d="curve" fill="none" stroke="#f0c74a" stroke-width="2.5" stroke-dasharray="7 6" data-testid="path-curve" />
      <polyline v-if="live.length > 1" :points="live.map((p) => `${p.x},${p.y}`).join(' ')" fill="none" stroke="#f0c74a" stroke-width="2" opacity="0.7" />
      <g v-for="(p, i) in screenPoints" :key="i" class="pointer-events-auto cursor-grab" :data-point="i" data-testid="path-handle">
        <circle :cx="p.x" :cy="p.y" r="14" fill="transparent" />
        <circle :cx="p.x" :cy="p.y" r="7" fill="#2b2019" stroke="#f0c74a" stroke-width="2.5" />
        <text :x="p.x + 11" :y="p.y - 9" font-size="11" font-weight="700" fill="#2b2019" stroke="#f0c74a" stroke-width="0.6" style="paint-order: stroke">{{ i + 1 }}</text>
      </g>
    </svg>
    <div v-if="drawing" class="pointer-events-auto absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-card px-2 py-1 shadow" data-testid="path-drawing-bar">
      <span class="text-caption whitespace-nowrap text-muted-foreground">Click to place points, or drag a line.</span>
      <AppButton variant="primary" size="sm" label="Finish path" title="Enter finishes, Esc cancels" @click="emit('done')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { curveThrough, hitPoint, offsetToScreen, screenToOffset, strokeToPoints } from "@/lib/bookNook/pathEdit";
import type { Layer, Point } from "@/lib/bookNook/scene";
import type { Projector } from "@/lib/bookNook/stageGeometry";

/**
 * A cut-out's path drawn over the stage (frame 05c): the smooth curve the engine follows, a numbered handle at
 * each point. Out of drawing, a handle drags to bend the path and a double-click takes it away. In drawing, a
 * click adds a point at the end, a press and drag draws a freehand line thinned to a few points, a press near a
 * point still drags it, Enter ends and Esc puts the path back as it was. The overlay owns no scene: it reports
 * the whole new list of offsets (from the layer's `at`) and the stage turns that into one op.
 */
const { points, closed, layer, projector, size, drawing } = defineProps<{
  points: Point[];
  closed: boolean;
  layer: Pick<Layer, "at" | "depth">;
  projector: Projector;
  size: { width: number; height: number };
  drawing: boolean;
}>();
const emit = defineEmits<{ points: [points: Point[]]; done: []; grab: [held: boolean] }>();

const svg = ref<SVGSVGElement | null>(null);
const screenPoints = computed(() => points.map((p) => offsetToScreen(projector, layer, p)));
const curve = computed(() => {
  if (points.length < 2) return null;
  return curveThrough(points, closed)
    .map((p, i) => {
      const s = offsetToScreen(projector, layer, p);
      return `${i === 0 ? "M" : "L"}${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
    })
    .join(" ");
});

// What the path was when drawing began, for Esc.
let before: Point[] = [];
watch(
  () => drawing,
  (on) => {
    if (on) before = points.map((p) => ({ ...p }));
  },
  { immediate: true },
);

useHotkeys(
  () => [
    { combo: "enter", description: "Finish drawing the path", handler: () => emit("done") },
    { combo: "escape", description: "Cancel drawing the path", handler: cancel },
  ],
  { enabled: () => drawing },
);
function cancel() {
  emit("points", before);
  emit("done");
}

// ── Pointer ───────────────────────────────────────────────────────────────────────────────────────────────────
const HIT = 10;
const CLICK_SLOP = 4;
type Drag = { kind: "point"; index: number } | { kind: "stroke"; from: Point; raw: Point[] };
let drag: Drag | null = null;
const live = ref<Point[]>([]);

function local(event: PointerEvent): Point {
  const box = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}
function onDown(event: PointerEvent) {
  const p = local(event);
  const attr = (event.target as Element).closest("[data-point]")?.getAttribute("data-point");
  const index = attr !== null && attr !== undefined ? Number(attr) : drawing ? hitPoint(screenPoints.value, p, HIT) : -1;
  if (index >= 0) drag = { kind: "point", index };
  else if (drawing) drag = { kind: "stroke", from: p, raw: [p] };
  else return;
  svg.value?.setPointerCapture(event.pointerId);
  emit("grab", true);
}
function onMove(event: PointerEvent) {
  if (!drag) return;
  const p = local(event);
  if (drag.kind === "point") {
    const next = points.map((q) => ({ ...q }));
    next[drag.index] = screenToOffset(projector, layer, p);
    emit("points", next);
  } else {
    drag.raw.push(p);
    live.value = [...drag.raw];
  }
}
function onUp(event: PointerEvent) {
  if (!drag) return;
  const g = drag;
  drag = null;
  live.value = [];
  if (svg.value?.hasPointerCapture(event.pointerId)) svg.value.releasePointerCapture(event.pointerId);
  emit("grab", false);
  if (g.kind !== "stroke") return;
  const last = g.raw[g.raw.length - 1];
  const moved = Math.hypot(last.x - g.from.x, last.y - g.from.y) > CLICK_SLOP;
  // A click adds one point; a drag adds the line, thinned in screen pixels so the look of the curve is what is kept.
  const added = moved ? strokeToPoints(g.raw, 7, 12, 3) : [g.from];
  emit("points", [...points.map((q) => ({ ...q })), ...added.map((q) => screenToOffset(projector, layer, q))]);
}

// A double-click is told to the svg that holds the pointer, not to the handle: the press captured it. So the
// handle is found again by where the click fell.
function onDouble(event: MouseEvent) {
  const box = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  const index = hitPoint(screenPoints.value, { x: event.clientX - box.left, y: event.clientY - box.top }, HIT);
  if (index >= 0) emit("points", points.filter((_, i) => i !== index).map((q) => ({ ...q })));
}
</script>
