<template>
  <div class="area-layer" :style="{ width: hostW + 'px', height: hostH + 'px' }" data-testid="play-area-layer" aria-hidden="true">
    <svg :width="hostW" :height="hostH">
      <path :d="coveredPathD" class="covered" :class="{ placed }" />
      <line v-if="template.aim && isRay" :x1="px(template.origin.x)" :y1="py(template.origin.y)" :x2="px(template.aim.x)" :y2="py(template.aim.y)" class="aim" />
      <circle :cx="px(template.origin.x)" :cy="py(template.origin.y)" r="4.5" class="origin" />
    </svg>
    <span v-if="label" class="label" :style="{ left: px(template.origin.x) + 'px', top: py(template.origin.y) - 14 + 'px' }" data-testid="play-area-label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AreaTemplate } from "@/lib/battlemap/areaTemplates";

/**
 * The area being placed or set down (#1125 frame 11): the squares it covers tinted in the danger tone, its point of
 * origin and, for a cone or line, where it points. The creatures inside are ringed by the token layer through the
 * map's selection, so this draws only the ground.
 */
const { cellPx, originX, originY, template, cells, placed = false, label = null } = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  template: AreaTemplate;
  cells: ReadonlySet<string>;
  /** Set down, as opposed to following the pointer. */
  placed?: boolean;
  /** "10 ft · 3 inside". */
  label?: string | null;
}>();

const px = (x: number) => originX + x * cellPx;
const py = (y: number) => originY + y * cellPx;
const isRay = computed(() => template.shape === "cone" || template.shape === "line");

const coveredPathD = computed(() =>
  [...cells]
    .map((key) => {
      const [cx, cy] = key.split(",").map(Number);
      const x = px(cx);
      const y = py(cy);
      return `M${x},${y} h${cellPx} v${cellPx} h${-cellPx} Z`;
    })
    .join(" "),
);
</script>

<style scoped>
.area-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.covered {
  fill: color-mix(in oklab, var(--color-tone-danger, #dc2626), transparent 70%);
  stroke: var(--color-tone-danger, #dc2626);
  stroke-width: 1;
  stroke-opacity: 0.5;
}

.covered.placed {
  fill: color-mix(in oklab, var(--color-tone-danger, #dc2626), transparent 58%);
  stroke-opacity: 0.85;
}

.aim {
  stroke: var(--color-tone-danger, #dc2626);
  stroke-width: 2;
  stroke-dasharray: 6 4;
}

.origin {
  fill: var(--color-tone-danger, #dc2626);
  stroke: rgb(255 255 255 / 0.9);
  stroke-width: 1.5;
}

.label {
  position: absolute;
  transform: translate(-50%, -100%);
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--color-tone-danger, #dc2626);
  border-radius: 0.375rem;
  background: color-mix(in oklab, var(--color-card), transparent 8%);
  color: var(--color-tone-danger, #dc2626);
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}
</style>
