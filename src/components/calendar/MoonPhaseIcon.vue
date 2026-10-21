<template>
  <svg
    viewBox="0 0 20 20"
    class="inline-block shrink-0 text-muted-foreground"
    :role="label ? 'img' : undefined"
    :aria-hidden="label ? undefined : 'true'"
    :aria-label="label"
  >
    <title v-if="label">{{ label }}</title>
    <!-- The dark side: a faint full disc, so a new moon still reads as a moon. -->
    <circle cx="10" cy="10" r="9" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-opacity="0.45" stroke-width="1" />
    <path data-lit :d="litPath" :fill="color ?? 'currentColor'" :fill-opacity="color ? 1 : 0.85" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * A moon at a given age (#1086): 0 is new, 0.5 full, a waxing moon (age < 0.5)
 * lit on the right. The lit part is bounded by a semicircle on the lit side and
 * an elliptical terminator whose half-width is r·|cos(2π·age)|; whether the
 * terminator bulges into the lit half (crescent) or the dark one (gibbous)
 * decides its sweep. Coordinates are SVG user space, so px is the right unit.
 */
const { age, color, label } = defineProps<{
  /** Position in the cycle, [0, 1): 0 new, 0.5 full. */
  age: number;
  /** The lit face's CSS colour; omitted means the neutral tone of the surrounding text. */
  color?: string;
  /** Spoken name; without it the icon is decorative. */
  label?: string;
}>();

const R = 9;
const C = 10;

const litPath = computed(() => {
  const a = ((age % 1) + 1) % 1;
  const waxing = a < 0.5;
  const cos = Math.cos(2 * Math.PI * a);
  const rx = (R * Math.abs(cos)).toFixed(3);
  const crescent = cos > 0;
  // Outer limb: top to bottom down the lit side (clockwise via the right when
  // waxing, counter-clockwise via the left when waning).
  const limbSweep = waxing ? 1 : 0;
  // Terminator: bottom back to top. It bulges into the lit half for a crescent.
  const termSweep = waxing === crescent ? 0 : 1;
  return `M ${C} ${C - R} A ${R} ${R} 0 0 ${limbSweep} ${C} ${C + R} A ${rx} ${R} 0 0 ${termSweep} ${C} ${C - R} Z`;
});
</script>
