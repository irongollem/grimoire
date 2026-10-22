<template>
  <svg
    class="pointer-events-none absolute left-0 top-0 text-foreground"
    :width="`${width}rem`"
    :height="`${height}rem`"
    :viewBox="`0 0 ${width} ${height}`"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
  >
    <!-- Marriage: a double line between partners, dashed for a former one. -->
    <g v-for="(m, i) in marriageLines" :key="`m${i}`" :stroke-dasharray="m.former ? DASH : undefined">
      <line :x1="m.x1" :x2="m.x2" :y1="m.y - 0.15" :y2="m.y - 0.15" :stroke-width="1" vector-effect="non-scaling-stroke" />
      <line :x1="m.x1" :x2="m.x2" :y1="m.y + 0.15" :y2="m.y + 0.15" :stroke-width="1" vector-effect="non-scaling-stroke" />
    </g>
    <!-- Descent: stem from the couple, a bar over the children, a drop to each (dashed when adoptive). -->
    <g v-for="(d, i) in descentLines" :key="`d${i}`">
      <path :d="d.trunk" stroke-width="1" vector-effect="non-scaling-stroke" />
      <path
        v-for="drop in d.drops"
        :key="drop.id"
        :d="drop.d"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
        :stroke-dasharray="drop.adoptive ? DASH : undefined"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TreeLayout } from "@/lib/kinship/layout";
import {
  AXIS_REM,
  CARD_H_REM,
  CARD_REM,
  ROW_PITCH_REM,
  cardLeft,
  cardTop,
  rowTop,
} from "./treeGeometry";

const { layout, width, height } = defineProps<{ layout: TreeLayout; width: number; height: number }>();

const DASH = "4 3";
const X = (units: number): number => AXIS_REM + units * CARD_REM;

const marriageLines = computed(() =>
  layout.marriages.map((m) => ({
    x1: X(m.x1),
    x2: X(m.x2),
    y: rowTop(m.row) + CARD_H_REM / 2,
    former: m.former,
  })),
);

const descentLines = computed(() => {
  const byId = new Map(layout.cards.map((c) => [c.id, c]));
  return layout.descents.map((d) => {
    const ax = X(d.anchorX);
    const parentRowTop = rowTop(d.row);
    // A couple's anchor hangs in the gap between them, so it leaves from the marriage line.
    const inCard = layout.cards.some((c) => c.row === d.row && ax >= cardLeft(c.x) && ax <= cardLeft(c.x) + CARD_REM);
    const startY = inCard ? parentRowTop + CARD_H_REM : parentRowTop + CARD_H_REM / 2 + 0.15;
    const barY = parentRowTop + CARD_H_REM + (ROW_PITCH_REM - CARD_H_REM) / 2;
    const xs = d.children.map((c) => X(c.x));
    const left = Math.min(ax, ...xs);
    const right = Math.max(ax, ...xs);
    const trunk = `M ${ax} ${startY} V ${barY} M ${left} ${barY} H ${right}`;
    const drops = d.children.flatMap((c) => {
      const card = byId.get(c.id);
      if (!card) return [];
      const x = X(c.x);
      return [{ id: c.id, adoptive: c.adoptive, d: `M ${x} ${barY} V ${cardTop(card)}` }];
    });
    return { trunk, drops };
  });
});
</script>
