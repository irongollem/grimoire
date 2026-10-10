<template>
  <!--
    An SVG overlay, not a canvas: a marker needs a crisp vector glyph and a
    native hover title, neither of which a canvas gives for free. Sits inside
    `MapFrame`'s transformed slot, after `MapRegionsLayer`, so it inherits pan
    and zoom the way pins and region shapes do — see `MapFrame.vue`'s own
    comment on why a `%`/viewBox-positioned child never needs to know `scale`.
  -->
  <svg
    v-if="calibration && imageNaturalWidth > 0 && imageNaturalHeight > 0"
    class="pointer-events-none absolute inset-0 h-full w-full"
    viewBox="0 0 1 1"
    preserveAspectRatio="none"
  >
    <g
      v-for="mark in placedMarks"
      :key="mark.id"
      class="pointer-events-auto cursor-pointer"
      :style="{ color: '#fff' }"
      @click="onMarkClick(mark)"
    >
      <title>{{ mark.label }} · {{ mark.subtitle }}</title>
      <ellipse
        :cx="mark.cx"
        :cy="mark.cy"
        :rx="mark.rx"
        :ry="mark.ry"
        :fill="mark.colour"
        :stroke="MARK_RING_COLOUR"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      <component
        :is="mark.icon"
        :x="mark.cx - mark.iconSize / 2"
        :y="mark.cy - mark.iconSize / 2"
        :size="mark.iconSize"
        stroke="#fff"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
/**
 * The Prepared layer (#868, S8, frame 10): traps, features, puzzles,
 * encounters and loot, drawn where `preparedMarks.ts` resolved them to sit.
 * Pure renderer, like `MapPinsLayer` — resolving *where* a mark goes is
 * `useSitePrepared`'s job, this only turns a resolved `PreparedMark` into
 * geometry.
 *
 * Clicking a mark with a room selects it (frame 10: "Prepared here · Nave of
 * Ash") rather than navigating straight to the entity — `LocationMap.vue`
 * owns what "selected" means (the panel it renders beside the plan) and
 * toggles the same room off on a second click, so this stays a pure emitter
 * exactly like `hover-region` on `MapRegionsLayer`. A mark with no room
 * (a hazard zone's own linked trap) has nowhere to select into, so it still
 * navigates straight there.
 *
 * One root `<svg>` with a `0 0 1 1` viewBox (image-fraction units) rather
 * than per-marker absolutely-positioned divs: `cellRectInImageFractions`
 * already returns a cell's rect in exactly those units, and drawing an
 * ellipse (not a circle) from its `w`/`h` is what keeps a marker visually
 * round even when the source image itself isn't square — the same reason
 * that function returns two separate fractions instead of one cell size.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { cellRectInImageFractions } from "@/lib/locations/gridCalibration";
import { MARK_RADIUS_CELLS, MARK_RING_COLOUR } from "@/lib/locations/preparedMarks";
import type { PreparedMark } from "@/lib/locations/preparedMarks";
import type { GridCalibration } from "@/types/location.types";

const { marks, calibration, imageNaturalWidth, imageNaturalHeight } = defineProps<{
  marks: PreparedMark[];
  calibration: GridCalibration | null;
  imageNaturalWidth: number;
  imageNaturalHeight: number;
}>();

const emit = defineEmits<{
  /** A mark with a room was clicked — `LocationMap.vue` decides what
   *  "selected" means and toggles it off on a repeat click. */
  "select-room": [spaceId: string];
}>();

const router = useRouter();

interface PlacedMark extends PreparedMark {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Lucide's `size` prop sets one square dimension (`Icon.mjs` always
   *  renders `width === height`), so the icon can't independently match an
   *  ellipse's two radii — sized off the tighter of the two so it never
   *  overflows the disc on either axis. */
  iconSize: number;
}

/** A glyph fills most of the disc but not all of it — a full-bleed icon
 *  reads as a solid shape rather than a symbol on a token. */
const ICON_FILL = 0.62;

const placedMarks = computed<PlacedMark[]>(() => {
  if (!calibration) return [];
  return marks.map((mark) => {
    const rect = cellRectInImageFractions(mark.cell, calibration, imageNaturalWidth, imageNaturalHeight);
    const cx = rect.x + rect.w / 2 + mark.fanOffset * rect.w;
    const cy = rect.y + rect.h / 2;
    const rx = MARK_RADIUS_CELLS * rect.w;
    const ry = MARK_RADIUS_CELLS * rect.h;
    return { ...mark, cx, cy, rx, ry, iconSize: Math.min(rx, ry) * 2 * ICON_FILL };
  });
});

function onMarkClick(mark: PreparedMark): void {
  if (mark.spaceId) emit("select-room", mark.spaceId);
  else router.push(mark.href);
}
</script>
