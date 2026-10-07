<template>
  <AppModal :open="open" size="lg" @close="cancel">
    <ModalHeader title="Calibrate Battle Map Grid" closeable @close="cancel" />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
      <p class="text-body text-muted-foreground leading-relaxed">
        Drag the two handles to span a known distance on the map (usually one side of a single
        5-ft square, or end-to-end of a known-length hallway). Then enter how many 5-ft squares
        that line covers. The VTT will use this scale to overlay a grid and snap tokens.
      </p>

      <!-- The two-handle picker is shared with the map scale dialog (#932). The
           live grid preview is this dialog's own, drawn into its overlay slot. -->
      <TwoPointImagePicker v-model:a="pointA" v-model:b="pointB" :map-url="mapUrl" @ready="onImageReady">
        <template #overlay="{ width, height }">
          <line
            v-for="(x, i) in gridPreviewVerticals"
            :key="`gv-${i}`"
            :x1="x"
            :y1="0"
            :x2="x"
            :y2="height"
            stroke="#fbbf24"
            stroke-width="1"
            :stroke-opacity="gridOpacity"
            vector-effect="non-scaling-stroke"
          />
          <line
            v-for="(y, i) in gridPreviewHorizontals"
            :key="`gh-${i}`"
            :x1="0"
            :y1="y"
            :x2="width"
            :y2="y"
            stroke="#fbbf24"
            stroke-width="1"
            :stroke-opacity="gridOpacity"
            vector-effect="non-scaling-stroke"
          />
        </template>
      </TwoPointImagePicker>

      <div class="flex flex-wrap items-end gap-4">
        <label class="flex flex-col gap-1">
          <span class="text-label-lg font-semibold text-muted-foreground">
            5-FT SQUARES BETWEEN HANDLES
          </span>
          <AppInput
            v-model.number="cellsBetween"
            type="number"
            min="1"
            step="1"
            tone="filled"
            size="body"
            :block="false"
            class="w-32"
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

    <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
      <AppButton
        variant="subtle"
        size="md"
        label="Cancel"
        @click="cancel"
      />
      <AppButton
        variant="primary"
        size="md"
        :disabled="!preview || saving"
        :label="saving ? 'Saving…' : 'Save Calibration'"
        @click="save"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import TwoPointImagePicker from "@/components/locations/TwoPointImagePicker.vue";
import { calibrateGrid } from "@/lib/battlemap/gridCalibration";
import { gridLinePositions } from "@/lib/battlemap/battleMapGeometry";
import type { ImageSize } from "@/lib/locations/mapScale";
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

const imageReady = ref(false);
const naturalW = ref(0);
const naturalH = ref(0);

// The grid preview lines are drawn in the picker's natural-pixel space (its
// svg viewBox), so they stay pixel-perfect at any rendered scale.
const canvasW = computed(() => naturalW.value || 1);
const canvasH = computed(() => naturalH.value || 1);

const pointA = ref({ x: 0.4, y: 0.5 });
const pointB = ref({ x: 0.6, y: 0.5 });
const cellsBetween = ref<number | null>(1);
const gridOpacity = ref<number>(DEFAULT_GRID_OPACITY);
const saving = ref(false);

watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    imageReady.value = false;
    saving.value = false;
    pointA.value = { x: 0.4, y: 0.5 };
    pointB.value = { x: 0.6, y: 0.5 };
    cellsBetween.value = 1;
  },
);

function onImageReady(size: ImageSize) {
  naturalW.value = size.width;
  naturalH.value = size.height;
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

// Preview and error message are two views of one calculation, so they come out
// of one computed. Assigning errorMessage from inside the preview computed made
// it a side effect: the message survived independently of the value that
// produced it, so any re-render that reused a cached preview could leave a
// stale error on screen next to a valid grid. Deriving both keeps them honest,
// and the reset on dialog open comes free — `open` clears `imageReady`, which
// lands in the first branch.
const calibration = computed<{ result: GridCalibration | null; error: string | null }>(() => {
  if (!imageReady.value || !cellsBetween.value || cellsBetween.value <= 0) {
    return { result: null, error: null };
  }
  try {
    return {
      result: calibrateGrid({
        pointAPct: pointA.value,
        pointBPct: pointB.value,
        cellsBetween: cellsBetween.value,
        imageNaturalWidth: naturalW.value,
        imageNaturalHeight: naturalH.value,
      }),
      error: null,
    };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : "Invalid calibration" };
  }
});

const preview = computed<GridCalibration | null>(() => calibration.value.result);
const errorMessage = computed<string | null>(() => calibration.value.error);

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
