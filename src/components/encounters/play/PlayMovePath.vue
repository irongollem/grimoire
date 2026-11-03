<template>
  <div class="move-path" :style="{ width: hostW + 'px', height: hostH + 'px' }" data-testid="play-move-path" aria-hidden="true">
    <svg :width="hostW" :height="hostH">
      <g v-for="line in lines" :key="line.id">
        <!-- Where it would land: a ghost square the size of the token. -->
        <rect
          :x="px(line.to.x)"
          :y="py(line.to.y)"
          :width="line.footprint * cellPx"
          :height="line.footprint * cellPx"
          :rx="line.footprint * cellPx * 0.5"
          class="ghost"
          :class="`state-${line.states[line.states.length - 1] ?? 'within'}`"
        />
        <line
          v-for="(seg, i) in segments(line)"
          :key="i"
          :x1="seg.x1"
          :y1="seg.y1"
          :x2="seg.x2"
          :y2="seg.y2"
          class="seg"
          :class="`state-${seg.state}`"
        />
      </g>
    </svg>
    <span v-if="label" class="label" :class="`state-${label.state}`" :style="{ left: label.x + 'px', top: label.y + 'px' }" data-testid="play-move-label">
      {{ label.text }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Cell, SpeedState } from "@/lib/battlemap/movement";

export interface PathLine {
  id: string;
  footprint: number;
  from: Cell;
  to: Cell;
  /** Where each step lands, in order, with the state it is in against the speed. */
  steps: Cell[];
  states: SpeedState[];
}

/**
 * The path a move would take, drawn over the map while a token is dragged or the pointer hovers a square (#1125
 * frames 10 and 11): gilt up to the speed, amber dashed through a Dash, red past twice the speed. It only draws;
 * it never refuses anything.
 */
const { cellPx, originX, originY, lines, labelText = null, labelState = "within", labelAt = null } = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  lines: PathLine[];
  /** The text that rides the end of the path ("40 ft · a Dash"), with where it sits (an anchor cell) and its state. */
  labelText?: string | null;
  labelState?: SpeedState;
  labelAt?: (Cell & { footprint: number }) | null;
}>();

const px = (cellX: number) => originX + cellX * cellPx;
const py = (cellY: number) => originY + cellY * cellPx;

function segments(line: PathLine): { x1: number; y1: number; x2: number; y2: number; state: SpeedState }[] {
  const mid = line.footprint / 2;
  let prev = line.from;
  return line.steps.map((step, i) => {
    const seg = {
      x1: px(prev.x + mid),
      y1: py(prev.y + mid),
      x2: px(step.x + mid),
      y2: py(step.y + mid),
      state: line.states[i] ?? "within",
    };
    prev = step;
    return seg;
  });
}

const label = computed(() =>
  labelText && labelAt ? { text: labelText, state: labelState, x: px(labelAt.x + labelAt.footprint / 2), y: py(labelAt.y) - 8 } : null,
);
</script>

<style scoped>
.move-path {
  --path-gilt: #c9a227;
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.seg {
  stroke-width: 4;
  stroke-linecap: round;
}

.ghost {
  fill: none;
  stroke-width: 2;
  stroke-dasharray: 4 3;
}

.state-within {
  stroke: var(--path-gilt);
  --label-ink: var(--path-gilt);
}

.state-dash {
  stroke: var(--color-tone-caution, #d97706);
  stroke-dasharray: 8 6;
  --label-ink: var(--color-tone-caution, #d97706);
}

.state-beyond {
  stroke: var(--color-tone-danger, #dc2626);
  stroke-dasharray: 8 6;
  --label-ink: var(--color-tone-danger, #dc2626);
}

.label {
  position: absolute;
  transform: translate(-50%, -100%);
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--label-ink);
  border-radius: 0.375rem;
  background: color-mix(in oklab, var(--color-card), transparent 8%);
  color: var(--label-ink);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
}
</style>
