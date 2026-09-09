<template>
  <div class="flex flex-col gap-2">
    <svg :viewBox="viewBoxAttr" preserveAspectRatio="xMidYMid meet" class="w-full h-auto rounded-md border border-border bg-[#0b0907]" aria-hidden="true">
      <g v-for="group in cellGroups" :key="group.key">
        <rect
          v-for="(r, i) in group.rects"
          :key="i"
          :x="r.x"
          :y="r.y"
          :width="r.w"
          :height="r.h"
          :fill="group.fill"
        />
        <path :d="group.outline" fill="none" :stroke="group.stroke" stroke-width="0.05" />
      </g>
      <line
        v-for="(bar, i) in doorBars"
        :key="`door-${i}`"
        :x1="bar.x1"
        :y1="bar.y1"
        :x2="bar.x2"
        :y2="bar.y2"
        :stroke="bar.color"
        stroke-width="0.18"
        stroke-linecap="round"
      />
    </svg>
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-caption-sm text-muted-foreground">
      <li v-for="entry in LEGEND" :key="entry.label" class="flex items-center gap-1.5">
        <span class="h-2.5 w-2.5 rounded-sm shrink-0" :style="{ background: entry.swatch }" />
        {{ entry.label }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * The plan preview (#868 S10, frame 05 "Publish to Atlas"): a diff-coloured
 * SVG of what a publish will do to the site's shape, drawn straight off the
 * `PublishPlan` the same modal's rows also read — one source, two views.
 *
 * "Held" rows share the "Changed" colour: the drawing genuinely differs from
 * the Atlas there, the write is simply skipped because the DM already edited
 * it by hand. The frame's four-entry legend (New/Changed/Gone/Unchanged) has
 * no fifth bucket for that, and visually it reads exactly like a change that
 * happened not to apply.
 */
import { computed } from "vue";
import { cellsRects, edgeSegment, outlinePath, planViewBox } from "@/lib/locations/planSvg";
import type { PublishPlan } from "@/lib/locations/publish";
import type { CellKey } from "@/types/dungeonMap.types";

const COLORS = {
  new: { fill: "rgba(74,222,128,.6)", stroke: "rgba(74,222,128,.9)" },
  changed: { fill: "rgba(251,191,36,.7)", stroke: "rgba(251,191,36,.95)" },
  gone: { fill: "rgba(239,68,68,.6)", stroke: "rgba(239,68,68,.9)" },
  unchanged: { fill: "rgba(255,255,255,.25)", stroke: "rgba(255,255,255,.4)" },
} as const;

const LEGEND = [
  { label: "New", swatch: COLORS.new.fill },
  { label: "Changed", swatch: COLORS.changed.fill },
  { label: "Gone", swatch: COLORS.gone.fill },
  { label: "Unchanged", swatch: COLORS.unchanged.fill },
] as const;

const { plan } = defineProps<{ plan: PublishPlan }>();

type Bucket = keyof typeof COLORS;

const bucketedCells = computed<Record<Bucket, CellKey[]>>(() => {
  const buckets: Record<Bucket, CellKey[]> = { new: [], changed: [], gone: [], unchanged: [] };
  for (const change of plan.spaces) {
    if (change.kind === "create") buckets.new.push(...change.space.cells);
    else if (change.kind === "update" || change.kind === "held") buckets.changed.push(...change.space.cells);
    else if (change.kind === "skip") buckets.unchanged.push(...change.space.cells);
    else if (change.kind === "orphan") buckets.gone.push(...change.region.cells);
  }
  return buckets;
});

const cellGroups = computed(() =>
  (Object.keys(bucketedCells.value) as Bucket[])
    .filter((key) => bucketedCells.value[key].length > 0)
    .map((key) => ({
      key,
      rects: cellsRects(bucketedCells.value[key]),
      outline: outlinePath(bucketedCells.value[key]),
      fill: COLORS[key].fill,
      stroke: COLORS[key].stroke,
    })),
);

interface DoorBar {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

// "Doors as bars where the edge key is known (create = green bar, held =
// amber)" — an update/skip is a door that already exists and hasn't moved,
// and a create-stair has no edge key at all, so neither draws a bar here.
const doorBars = computed<DoorBar[]>(() =>
  plan.ways.flatMap((change): DoorBar[] => {
    if (change.kind === "create") return [{ ...edgeSegment(change.way.edgeKey, 0.15), color: COLORS.new.stroke }];
    if (change.kind === "held") return [{ ...edgeSegment(change.way.edgeKey, 0.15), color: COLORS.changed.stroke }];
    return [];
  }),
);

const viewBox = computed(() => planViewBox(Object.values(bucketedCells.value)) ?? { minX: 0, minY: 0, width: 1, height: 1 });
const viewBoxAttr = computed(() => `${viewBox.value.minX} ${viewBox.value.minY} ${viewBox.value.width} ${viewBox.value.height}`);
</script>
