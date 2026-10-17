<template>
  <canvas
    ref="canvasEl"
    class="veil"
    :width="hostW"
    :height="hostH"
    :style="{ width: hostW + 'px', height: hostH + 'px' }"
  />
</template>

<script setup lang="ts">
// The darkness veil of a battle map (epic #1073): the map's ambient light level laid over the image, carved by the
// snapshot's lights by the rules, stopped by walls (bright clears, the dim ring halves, the brightest source wins; see
// `lib/battlemap/illumination.ts`). It runs no loop: a flickering fire does not move the veil, and reduced-motion
// users get the same still picture. The stack mounts it last, so room focus, tokens and fog stay above it.
//
// The DM sees the whole map under a translucent veil (`viewers` null, `paintLitVeil`). A player sees through their own
// token (`viewers` set, `paintPlayerVeil`): what it cannot see is opaque, what it sees dimly is lightly veiled, and
// where darkvision reaches into darkness the map's pictures show in grey (`lib/battlemap/vision.ts`). The grey needs
// the stack's pictures as loaded images; until they arrive the veil is drawn without it and redrawn on load.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { domMakeCanvas, paintLitVeil, paintPlayerVeil, type GreyImage } from "@/lib/battlemap/darkness";
import { AMBIENT, illuminationGrid } from "@/lib/battlemap/illumination";
import { occludersOf } from "@/lib/battlemap/occlusion";
import { visionGrid, type Viewer } from "@/lib/battlemap/vision";
import type { MapLive } from "@/types/mapLive.types";

/** Light levels sampled per cell along each axis: enough for the soft edges to be smooth at any zoom. */
const SAMPLES_PER_CELL = 4;

const {
  hostW,
  hostH,
  panX,
  panY,
  imageW,
  imageH,
  cellPx,
  originX,
  originY,
  live,
  viewers = null,
  groundUrl = null,
  standUrl = null,
} = defineProps<{
  hostW: number;
  hostH: number;
  panX: number;
  panY: number;
  /** The image's drawn size on screen, in px: the veil covers exactly the map. */
  imageW: number;
  imageH: number;
  cellPx: number;
  /** Host px of image cell (0,0)'s top-left, as for the live layer and the fog. */
  originX: number;
  originY: number;
  live: MapLive;
  /** Whose sight the veil shows: null is the DM's translucent veil over everything. */
  viewers?: Viewer[] | null;
  /** The stack's pictures, drawn in grey where darkvision sees only shades of grey. */
  groundUrl?: string | null;
  standUrl?: string | null;
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const makeCanvas = domMakeCanvas();

// The window of image cells under the image, as three integers: a pan that only translates changes none of them (the
// computeds only notify on a changed value), so the grid below is not recomputed and only its drawing moves.
const firstCol = computed(() => (cellPx > 0 ? Math.floor((panX - originX) / cellPx) : 0));
const firstRow = computed(() => (cellPx > 0 ? Math.floor((panY - originY) / cellPx) : 0));
const cols = computed(() => (cellPx > 0 ? Math.ceil((panX + imageW - originX) / cellPx) - firstCol.value : 0));
const rows = computed(() => (cellPx > 0 ? Math.ceil((panY + imageH - originY) / cellPx) - firstRow.value : 0));

// Walls, closed doors and solid rock stop light and sight; built once per snapshot.
const occluders = computed(() => occludersOf(live));

const grid = computed(() =>
  illuminationGrid({
    ambient: AMBIENT[live.darkness],
    sources: live.lights,
    occluders: occluders.value,
    minX: firstCol.value,
    minY: firstRow.value,
    cols: cols.value,
    rows: rows.value,
    samplesPerCell: SAMPLES_PER_CELL,
  }),
);

// Viewers arrive as a fresh array whenever the encounter state is pushed; sight only changes when one moves or its
// range does, so an equal set keeps the previous array and the vision grid below is not rebuilt.
const sameViewers = (a: readonly Viewer[], b: readonly Viewer[]) =>
  a.length === b.length && a.every((v, i) => v.x === b[i].x && v.y === b[i].y && v.darkvisionFeet === b[i].darkvisionFeet &&
      v.blindsightFeet === b[i].blindsightFeet &&
      v.truesightFeet === b[i].truesightFeet,
  );
const stableViewers = computed<Viewer[] | null>((prev) => {
  if (!viewers) return null;
  return prev && sameViewers(prev, viewers) ? prev : viewers;
});

const vision = computed(() =>
  stableViewers.value
    ? visionGrid({
        illumination: grid.value,
        minX: firstCol.value,
        minY: firstRow.value,
        cols: cols.value,
        rows: rows.value,
        samplesPerCell: SAMPLES_PER_CELL,
        viewers: stableViewers.value,
        occluders: occluders.value,
      })
    : null,
);

// Each picture is loaded once per url. A shallow map swapped on load, so the redraw watch sees the change.
const loadedImages = shallowRef<ReadonlyMap<string, HTMLImageElement>>(new Map());
const requested = new Set<string>();
function load(url: string): void {
  if (requested.has(url)) return;
  requested.add(url);
  const img = new Image();
  img.onload = () => {
    loadedImages.value = new Map(loadedImages.value).set(url, img);
  };
  img.src = url;
}
watch(
  () => (viewers ? [groundUrl, standUrl] : []),
  (urls) => {
    for (const url of urls) if (url) load(url);
  },
  { immediate: true },
);

function greyImages(): GreyImage[] {
  const rect = { x: panX, y: panY, w: imageW, h: imageH };
  return [groundUrl, standUrl].flatMap((url) => {
    const image = url ? loadedImages.value.get(url) : undefined;
    return image ? [{ image, rect }] : [];
  });
}

function draw(): void {
  const ctx = canvasEl.value?.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, hostW, hostH);
  if (cols.value <= 0 || rows.value <= 0) return;
  ctx.save();
  // The grid is whole cells and may overhang the image by up to one; the veil covers exactly the map.
  ctx.beginPath();
  ctx.rect(panX, panY, imageW, imageH);
  ctx.clip();
  const rect = {
    x: originX + firstCol.value * cellPx,
    y: originY + firstRow.value * cellPx,
    w: cols.value * cellPx,
    h: rows.value * cellPx,
  };
  const gridW = cols.value * SAMPLES_PER_CELL;
  const gridH = rows.value * SAMPLES_PER_CELL;
  if (vision.value) paintPlayerVeil(ctx, rect, vision.value, gridW, gridH, makeCanvas, greyImages());
  else paintLitVeil(ctx, rect, grid.value, gridW, gridH, makeCanvas);
  ctx.restore();
}

// Resizing a canvas clears it, and the host size is a prop, so redraw whenever any input changes.
watch(
  () => [hostW, hostH, panX, panY, imageW, imageH, cellPx, originX, originY, grid.value, vision.value, loadedImages.value],
  draw,
  { flush: "post" },
);
onMounted(draw);
onBeforeUnmount(() => canvasEl.value?.getContext("2d")?.clearRect(0, 0, hostW, hostH));
</script>

<style scoped>
.veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
