<template>
  <RangeControl
    :id="id"
    v-model="radius"
    label="Size"
    :min="BRUSH_RADIUS_MIN"
    :max="BRUSH_RADIUS_MAX"
    :step="BRUSH_RADIUS_STEP"
    :readout="`${radius * 2 * FEET_PER_CELL} ft across`"
  />
</template>

<script setup lang="ts">
// The round brush's size, in cells of radius, shown as feet across. One control for the Drawing's brush and the
// Zoning brush (#1197), which paint with the same round stroke.
import RangeControl from "@/components/cartographer/RangeControl.vue";
import { BRUSH_RADIUS_MAX, BRUSH_RADIUS_MIN, BRUSH_RADIUS_STEP } from "@/cartographer/keymap";

const FEET_PER_CELL = 5;

defineProps<{ id: string }>();
const radius = defineModel<number>({ required: true });
</script>
