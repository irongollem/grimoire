<template>
  <!-- The grid's numbers, shared by "Bring a map" (frame 06) and the Picture layer's "Line up the grid" (frame 07):
       the stepper, what follows from the picture's shape, and the one-square box. -->
  <div class="flex flex-col gap-3">
    <label class="flex items-center justify-between gap-3">
      <span class="text-label-lg font-semibold text-foreground">Squares across</span>
      <AppInput
        v-model.number.lazy="across"
        type="number"
        min="1"
        max="400"
        step="1"
        tone="card"
        size="body-xs"
        align="right"
        :block="false"
        class="w-20"
        aria-label="Squares across"
      />
    </label>
    <div class="flex items-center justify-between gap-3">
      <span class="text-label-lg font-semibold text-foreground">Squares down</span>
      <span class="text-body-sm text-muted-foreground">{{ down }} <span class="text-caption">from the picture's shape</span></span>
    </div>

    <div v-if="squareFeet !== undefined" class="flex items-center justify-between gap-3">
      <span class="text-label-lg font-semibold text-foreground">Each square</span>
      <SegmentedControl v-model="squareFeet" :options="SQUARE_OPTIONS" size="xs" />
    </div>

    <AppButton
      variant="outline"
      size="sm"
      :icon="IconGrid"
      :active="boxMode"
      :aria-pressed="boxMode"
      label="Draw a box over one square"
      @click="boxMode = !boxMode"
    />
    <p class="text-caption text-muted-foreground">
      No size in the name? Draw a box over one square on the map and the rest follows.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { IconGrid } from "@/lib/icons";
import { squaresDown, withSquaresAcross, type ImageSize, type SquareFeet } from "@/lib/mapBring/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

const { natural } = defineProps<{ natural: ImageSize }>();

const calibration = defineModel<GridCalibration>({ required: true });
const boxMode = defineModel<boolean>("boxMode", { default: false });
/** Absent: the picture's squares are 5 ft and there is nothing to ask (the Picture layer). */
const squareFeet = defineModel<SquareFeet | undefined>("squareFeet", { default: undefined });

const SQUARE_OPTIONS: SegmentedOption<SquareFeet>[] = [
  { value: 5, label: "5 ft" },
  { value: 10, label: "10 ft" },
];

// One decimal: a box over a square is never a whole number of squares.
const across = computed<number | null>({
  get: () => Number(calibration.value.cells_per_image_width.toFixed(1)),
  set: (value) => {
    // A cleared field is absent, not zero: keep the grid until a number is typed.
    if (value === null || !(value >= 1)) return;
    calibration.value = withSquaresAcross(calibration.value, natural, value);
  },
});
const down = computed(() => Number(squaresDown(calibration.value, natural).toFixed(1)));
</script>
