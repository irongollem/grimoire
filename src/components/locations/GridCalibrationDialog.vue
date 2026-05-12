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
          <h2 class="font-cinzel text-lg font-bold text-foreground">Calibrate Battle Map Grid</h2>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="cancel"
          >
            ✕
          </button>
        </div>

        <div class="px-5 py-4 space-y-4">
          <p class="font-fell text-sm text-muted-foreground leading-relaxed">
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
              <line
                :x1="pointA.x * canvasW"
                :y1="pointA.y * canvasH"
                :x2="pointB.x * canvasW"
                :y2="pointB.y * canvasH"
                stroke="#fbbf24"
                stroke-width="2"
                stroke-dasharray="6 4"
              />
            </svg>

            <button
              v-if="imageReady"
              type="button"
              class="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow-lg cursor-grab active:cursor-grabbing touch-none"
              :class="{ 'cursor-grabbing': dragging === 'A' }"
              :style="{ left: `${pointA.x * 100}%`, top: `${pointA.y * 100}%` }"
              :aria-label="'Handle A'"
              @pointerdown.prevent="startDrag('A', $event)"
            />
            <button
              v-if="imageReady"
              type="button"
              class="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-400 shadow-lg cursor-grab active:cursor-grabbing touch-none"
              :class="{ 'cursor-grabbing': dragging === 'B' }"
              :style="{ left: `${pointB.x * 100}%`, top: `${pointB.y * 100}%` }"
              :aria-label="'Handle B'"
              @pointerdown.prevent="startDrag('B', $event)"
            />
          </div>

          <div class="flex flex-wrap items-end gap-4">
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">
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
            <p v-if="preview" class="font-fell text-sm text-muted-foreground">
              ≈ <span class="text-foreground font-semibold">{{ preview.cells_per_image_width.toFixed(1) }}</span>
              squares across the image width.
            </p>
            <p v-else-if="errorMessage" class="font-fell text-sm text-destructive">
              {{ errorMessage }}
            </p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            @click="cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="!preview || saving"
            class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
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
import type { GridCalibration } from "@/types/location.types";

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
  // Seed handles to span exactly one cell using existing calibration so the
  // dialog opens "where the DM left off" for re-calibration.
  if (existing && existing.cells_per_image_width > 0) {
    const cellWidthPct = 1 / existing.cells_per_image_width;
    pointA.value = { x: 0.4, y: 0.5 };
    pointB.value = { x: 0.4 + cellWidthPct, y: 0.5 };
    cellsBetween.value = 1;
  }
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

function cancel() {
  emit("cancel");
}

function save() {
  if (!preview.value) return;
  saving.value = true;
  emit("save", preview.value);
}
</script>
