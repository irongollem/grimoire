<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="cancel"
    >
      <div
        class="bg-card border border-border rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="text-heading font-bold text-foreground">Calibrate Battle Map Grid</h2>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="cancel"
          >
            ✕
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          <p class="text-body text-muted-foreground leading-relaxed">
            Drag the two handles to span a known distance on the map — usually one side of a single
            5-ft square, or end-to-end of a known-length hallway. Then enter how many 5-ft squares
            that line covers. The VTT will use this scale to overlay a grid and snap tokens.
          </p>

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
              :viewBox="`0 0 ${canvasW} ${canvasH}`"
              preserveAspectRatio="none"
            >
              <!-- Live grid preview — vertical -->
              <line
                v-for="(x, i) in gridPreviewVerticals"
                :key="`gv-${i}`"
                :x1="x"
                :y1="0"
                :x2="x"
                :y2="canvasH"
                stroke="#fbbf24"
                stroke-width="1"
                :stroke-opacity="gridOpacity"
                vector-effect="non-scaling-stroke"
              />
              <!-- Live grid preview — horizontal -->
              <line
                v-for="(y, i) in gridPreviewHorizontals"
                :key="`gh-${i}`"
                :x1="0"
                :y1="y"
                :x2="canvasW"
                :y2="y"
                stroke="#fbbf24"
                stroke-width="1"
                :stroke-opacity="gridOpacity"
                vector-effect="non-scaling-stroke"
              />
              <!-- Calibration line between the two handles -->
              <line
                :x1="pointA.x * canvasW"
                :y1="pointA.y * canvasH"
                :x2="pointB.x * canvasW"
                :y2="pointB.y * canvasH"
                stroke="#fbbf24"
                stroke-width="2"
                stroke-dasharray="6 4"
                vector-effect="non-scaling-stroke"
              />
            </svg>

            <button
              v-if="imageReady"
              type="button"
              class="calib-handle handle-a"
              :class="{ 'is-dragging': dragging === 'A' }"
              :style="{ left: `${pointA.x * 100}%`, top: `${pointA.y * 100}%` }"
              :aria-label="'Handle A'"
              @pointerdown.prevent="startDrag('A', $event)"
            >
              <span class="arm arm-h" />
              <span class="arm arm-v" />
              <span class="ring" />
              <span class="dot" />
            </button>
            <button
              v-if="imageReady"
              type="button"
              class="calib-handle handle-b"
              :class="{ 'is-dragging': dragging === 'B' }"
              :style="{ left: `${pointB.x * 100}%`, top: `${pointB.y * 100}%` }"
              :aria-label="'Handle B'"
              @pointerdown.prevent="startDrag('B', $event)"
            >
              <span class="arm arm-h" />
              <span class="arm arm-v" />
              <span class="ring" />
              <span class="dot" />
            </button>
          </div>

          <div class="flex flex-wrap items-end gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-label-lg font-semibold text-muted-foreground">
                5-FT SQUARES BETWEEN HANDLES
              </span>
              <input
                v-model.number="cellsBetween"
                type="number"
                min="1"
                step="1"
                class="w-32 bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label class="flex flex-col gap-1 min-w-48">
              <span class="text-label-lg font-semibold text-muted-foreground">
                GRID OPACITY · {{ Math.round(gridOpacity * 100) }}%
              </span>
              <input
                v-model.number="gridOpacity"
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="w-48"
              />
              <span class="text-caption text-muted-foreground/70 italic">
                Lower if the map already has its own gridlines.
              </span>
            </label>
            <p v-if="preview" class="text-body text-muted-foreground">
              ≈ <span class="text-foreground font-semibold">{{ preview.cells_per_image_width.toFixed(1) }}</span>
              squares across the image width.
            </p>
            <p v-else-if="errorMessage" class="text-body text-destructive">
              {{ errorMessage }}
            </p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            class="px-4 py-2 text-label-lg font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            @click="cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="!preview || saving"
            class="px-4 py-2 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="save"
          >
            {{ saving ? "Saving…" : "Save Calibration" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { calibrateGrid } from "@/lib/gridCalibration";
import { gridLinePositions } from "@/lib/battleMapGeometry";
import { DEFAULT_GRID_OPACITY, type GridCalibration } from "@/types/location.types";

const { open, mapUrl, existing } = defineProps<{
  open: boolean;
  mapUrl: string | null;
  existing?: GridCalibration | null;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [calibration: GridCalibration];
}>();

const img = ref<HTMLImageElement | null>(null);
const canvas = ref<HTMLDivElement | null>(null);
const imageReady = ref(false);
const naturalW = ref(0);
const naturalH = ref(0);
const aspectRatio = computed(() =>
  naturalW.value && naturalH.value ? `${naturalW.value} / ${naturalH.value}` : "",
);

// canvasW/H are the on-screen dimensions used for the svg overlay viewBox.
// We use the natural dimensions so the line/handles stay pixel-perfect at any
// rendered scale; preserveAspectRatio="none" stretches the svg to fit.
const canvasW = computed(() => naturalW.value || 1);
const canvasH = computed(() => naturalH.value || 1);

const pointA = ref({ x: 0.4, y: 0.5 });
const pointB = ref({ x: 0.6, y: 0.5 });
const cellsBetween = ref<number | null>(1);
const gridOpacity = ref<number>(DEFAULT_GRID_OPACITY);
const dragging = ref<"A" | "B" | null>(null);
const saving = ref(false);
const errorMessage = ref<string | null>(null);

watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    imageReady.value = false;
    errorMessage.value = null;
    saving.value = false;
    pointA.value = { x: 0.4, y: 0.5 };
    pointB.value = { x: 0.6, y: 0.5 };
    cellsBetween.value = 1;
  },
);

function onImageLoad() {
  if (!img.value) return;
  naturalW.value = img.value.naturalWidth;
  naturalH.value = img.value.naturalHeight;
  imageReady.value = true;
  // Seed handles to the existing calibration so re-opening + Save without
  // changes round-trips to the same {cells_per_image_width, origin}. We
  // place handle A on the grid intersection nearest the image centre and
  // handle B one cell to its right; both sit on grid lines, so saving with
  // cellsBetween=1 reproduces the stored calibration exactly.
  if (existing && existing.cells_per_image_width > 0 && naturalW.value > 0) {
    const cellPx = naturalW.value / existing.cells_per_image_width;
    const originXpx = existing.origin_x_pct * naturalW.value;
    const originYpx = existing.origin_y_pct * naturalH.value;
    const centreX = naturalW.value / 2;
    const centreY = naturalH.value / 2;
    const ax = originXpx + Math.round((centreX - originXpx) / cellPx) * cellPx;
    const ay = originYpx + Math.round((centreY - originYpx) / cellPx) * cellPx;
    pointA.value = { x: ax / naturalW.value, y: ay / naturalH.value };
    pointB.value = { x: (ax + cellPx) / naturalW.value, y: ay / naturalH.value };
    cellsBetween.value = 1;
  }
  gridOpacity.value = existing?.grid_opacity ?? DEFAULT_GRID_OPACITY;
}

function startDrag(which: "A" | "B", e: PointerEvent) {
  dragging.value = which;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || !canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  if (dragging.value === "A") pointA.value = { x, y };
  else pointB.value = { x, y };
}

function onPointerUp() {
  dragging.value = null;
}

const preview = computed<GridCalibration | null>(() => {
  if (!imageReady.value || !cellsBetween.value || cellsBetween.value <= 0) {
    errorMessage.value = null;
    return null;
  }
  try {
    const result = calibrateGrid({
      pointAPct: pointA.value,
      pointBPct: pointB.value,
      cellsBetween: cellsBetween.value,
      imageNaturalWidth: naturalW.value,
      imageNaturalHeight: naturalH.value,
    });
    errorMessage.value = null;
    return result;
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Invalid calibration";
    return null;
  }
});

// Live grid overlay derived from the current preview calibration. Lines are
// expressed in image-natural-pixel space so they align with the SVG viewBox;
// non-scaling-stroke (in the template) keeps them ~1 display pixel thick.
const previewCellPx = computed(() =>
  preview.value && preview.value.cells_per_image_width > 0 && naturalW.value > 0
    ? naturalW.value / preview.value.cells_per_image_width
    : 0,
);
const gridPreviewVerticals = computed(() =>
  previewCellPx.value > 0
    ? gridLinePositions(
        preview.value!.origin_x_pct * naturalW.value,
        canvasW.value,
        previewCellPx.value,
      )
    : [],
);
const gridPreviewHorizontals = computed(() =>
  previewCellPx.value > 0
    ? gridLinePositions(
        preview.value!.origin_y_pct * naturalH.value,
        canvasH.value,
        previewCellPx.value,
      )
    : [],
);

function cancel() {
  emit("cancel");
}

function save() {
  if (!preview.value) return;
  saving.value = true;
  emit("save", { ...preview.value, grid_opacity: gridOpacity.value });
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
