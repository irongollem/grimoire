<template>
  <label class="text-label text-muted-foreground" :for="id">Size</label>
  <!-- A bare range input: the app has no slider primitive, and this one carries no chrome of its own beyond the track. -->
  <input
    :id="id"
    type="range"
    :min="BRUSH_RADIUS_MIN"
    :max="BRUSH_RADIUS_MAX"
    :step="BRUSH_RADIUS_STEP"
    :value="radius"
    class="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-border accent-primary"
    @input="(e) => (radius = parseFloat((e.target as HTMLInputElement).value))"
  />
  <span class="text-caption text-muted-foreground tabular-nums">{{ radius * 2 * FEET_PER_CELL }} ft across</span>
</template>

<script setup lang="ts">
// The round brush's size, in cells of radius, shown as feet across. One control for the Drawing's brush and the
// Zoning brush (#1197), which paint with the same round stroke.
import { BRUSH_RADIUS_MAX, BRUSH_RADIUS_MIN, BRUSH_RADIUS_STEP } from "@/cartographer/keymap";

const FEET_PER_CELL = 5;

defineProps<{ id: string }>();
const radius = defineModel<number>({ required: true });
</script>
