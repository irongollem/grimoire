<template>
  <!--
    Renders one map stack's imagery, bottom to top: the Picture (only visible
    when a Drawing sits above it and lets it show through), the primary layer
    (Drawing if there is one, else Picture, else nothing), or — with neither
    image — a blank grid ground at the plan's natural size. A stack with no
    layer at all renders nothing; callers gate on `hasAnyMapLayer` before ever
    mounting this, so that branch is a guard rather than a state this reaches
    in practice.

    `w-fit` so this box sizes to its own content exactly like the single
    `<img>` it replaces — `MapFrame`'s `mapContainer` (and, for the zoom
    overlay, `AtlasMapZoom`'s flex-centered box) both size around it the same
    way they sized around a bare image before.
  -->
  <div v-if="stack.hasAnyLayer" class="relative w-fit max-w-full">
    <!--
      The Picture, showing through wherever the Drawing above it has nothing
      painted. Positioned via `placePicture` once both layers have reported
      their natural size and both are calibrated; until then (or if either
      calibration is missing) it simply covers the primary box, which is a
      reasonable placement to start from rather than nothing at all.
    -->
    <img
      v-if="showsUnderlyingPicture"
      :src="stack.picture!.url"
      class="pointer-events-none rounded-lg absolute"
      :style="underlyingPictureStyle"
      draggable="false"
      alt=""
      @load="onPictureLoad"
    />

    <!--
      The primary layer — its natural pixel box IS the frame. `relative` is
      load-bearing: the Picture above is absolutely positioned, and a
      positioned element paints over in-flow content regardless of DOM order,
      so an unpositioned Drawing sat *under* the Picture it was meant to show
      through to. Positioning both makes DOM order decide, Picture first.
    -->
    <img
      v-if="stack.primary"
      :src="stack.primary.url"
      class="pointer-events-none rounded-lg relative"
      :class="[MAP_IMAGE_SIZING, compact ? MAP_IMAGE_COMPACT_SIZING : '']"
      :style="primaryStyle"
      draggable="false"
      alt="Location map"
      @load="onPrimaryLoad"
      @error="onPrimaryError"
    />

    <!--
      No image layer — a blank grid ground at the plan's natural size (#884).
      An inline SVG rather than a sized div on purpose: with `width`/`height`
      attributes and a matching `viewBox` it has an intrinsic ratio, so the
      same `max-w-full` / `max-h-*` sizing classes scale it exactly as they
      scale an image. A div under those classes is clamped on each axis
      independently and squashes; a 24×16 plan rendered 706×800 and every
      cell went with it. The faint grid is drawn here, in the ground's own
      colour, because the regions layer's grid pass strokes white — invisible
      on parchment, meant for photographs and bakes. SVG user-space units are
      px by nature (a sanctioned exception).
    -->
    <svg
      v-else-if="stack.blank"
      class="rounded-lg border border-border bg-card text-border"
      :class="[MAP_IMAGE_SIZING, compact ? MAP_IMAGE_COMPACT_SIZING : '']"
      :width="blankSize.w"
      :height="blankSize.h"
      :viewBox="`0 0 ${blankSize.w} ${blankSize.h}`"
      role="img"
      aria-label="Blank plan"
    >
      <defs>
        <pattern :id="gridPatternId" :width="stack.blank.cellPx" :height="stack.blank.cellPx" patternUnits="userSpaceOnUse">
          <path :d="`M ${stack.blank.cellPx} 0 L 0 0 0 ${stack.blank.cellPx}`" fill="none" stroke="currentColor" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" :fill="`url(#${gridPatternId})`" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import type { CSSProperties } from "vue";
import { MAP_IMAGE_COMPACT_SIZING, MAP_IMAGE_SIZING } from "@/lib/locations/mapZoom";
import { placePicture } from "@/lib/locations/mapStack";
import type { MapStack, PlacedRect } from "@/lib/locations/mapStack";

const { stack, compact = false, visible = { picture: true, drawing: true } } = defineProps<{
  stack: MapStack;
  /** Cap the primary/blank box's height, mirroring `MapFrame`'s own prop. */
  compact?: boolean;
  /**
   * Which of the Picture/Drawing layers currently paint — the site map's
   * layer bar (#884). The primary layer keeps its box even while hidden
   * (`visibility: hidden`, never `display: none`) so `MapFrame`'s `w-fit`
   * container doesn't collapse out from under a slotted overlay that
   * positions itself in fractions of that box.
   */
  visible?: { picture: boolean; drawing: boolean };
}>();

const emit = defineEmits<{
  /** The primary layer's natural pixel size — or, for a blank grid, its
   *  synthetic `cols*cellPx` × `rows*cellPx` size — fired as soon as it is
   *  known (immediately for a blank grid; on `load` for an image). */
  measured: [naturalWidth: number, naturalHeight: number];
  /** The primary image failed to load. Never fired for a blank grid — there
   *  is no image to fail. */
  failed: [];
}>();

const showsUnderlyingPicture = computed(() => stack.primary?.kind === "drawing" && !!stack.picture);

const primaryNatural = ref<{ w: number; h: number } | null>(null);
const pictureNatural = ref<{ w: number; h: number } | null>(null);

// A new primary (a different site, or the picture/drawing swapped) starts
// unmeasured again — stale natural sizes from the previous map must not
// drive this map's `placePicture` placement even for the one frame before
// the new image's own `load` fires.
watch(
  () => stack.primary?.url ?? null,
  () => { primaryNatural.value = null; },
);
watch(
  () => stack.picture?.url ?? null,
  () => { pictureNatural.value = null; },
);

const pictureRect = computed<PlacedRect | null>(() => {
  if (!showsUnderlyingPicture.value || !primaryNatural.value || !pictureNatural.value) return null;
  return placePicture(stack, primaryNatural.value, pictureNatural.value);
});

const underlyingPictureStyle = computed<CSSProperties>(() => {
  const rect = pictureRect.value;
  return {
    left: rect ? `${rect.left * 100}%` : "0%",
    top: rect ? `${rect.top * 100}%` : "0%",
    width: rect ? `${rect.width * 100}%` : "100%",
    height: rect ? `${rect.height * 100}%` : "100%",
    visibility: visible.picture ? undefined : "hidden",
  };
});

const primaryStyle = computed<CSSProperties>(() => {
  const shown = stack.primary?.kind === "picture" ? visible.picture : visible.drawing;
  return { visibility: shown ? undefined : "hidden" };
});

const blankSize = computed(() => {
  const blank = stack.blank;
  if (!blank) return { w: 0, h: 0 };
  return { w: blank.cols * blank.cellPx, h: blank.rows * blank.cellPx };
});
// One pattern id per instance: the Atlas zoom overlay mounts two of these at once.
const gridPatternId = `plan-grid-${useId()}`;

function onPrimaryLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  primaryNatural.value = { w: img.naturalWidth, h: img.naturalHeight };
  emit("measured", img.naturalWidth, img.naturalHeight);
}

function onPrimaryError() {
  emit("failed");
}

function onPictureLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  pictureNatural.value = { w: img.naturalWidth, h: img.naturalHeight };
}

// A blank grid has no image to load — its size is known synthetically and
// immediately, so `measured` fires without waiting on anything.
watch(
  () => stack.blank,
  (blank) => {
    if (blank) emit("measured", blank.cols * blank.cellPx, blank.rows * blank.cellPx);
  },
  { immediate: true },
);
</script>
