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
// snapshot's lights by the rules (bright clears, the dim ring halves, the brightest source wins; see
// `lib/battlemap/illumination.ts`). It runs no loop: a flickering fire does not move the veil, and reduced-motion
// users get the same still picture. The stack mounts it last, so room focus, tokens and fog stay above it.
//
// For now the DM and the players see the same translucent veil. Per-token vision (story 5) replaces it for players
// through `paintLitVeil` in `lib/battlemap/darkness.ts`.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { domMakeCanvas, paintLitVeil } from "@/lib/battlemap/darkness";
import { AMBIENT, illuminationGrid } from "@/lib/battlemap/illumination";
import type { MapLive } from "@/types/mapLive.types";

/** Light levels sampled per cell along each axis: enough for the soft edges to be smooth at any zoom. */
const SAMPLES_PER_CELL = 4;

const { hostW, hostH, panX, panY, imageW, imageH, cellPx, originX, originY, live } = defineProps<{
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
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const makeCanvas = domMakeCanvas();

// The window of image cells under the image, as three integers: a pan that only translates changes none of them (the
// computeds only notify on a changed value), so the grid below is not recomputed and only its drawing moves.
const firstCol = computed(() => (cellPx > 0 ? Math.floor((panX - originX) / cellPx) : 0));
const firstRow = computed(() => (cellPx > 0 ? Math.floor((panY - originY) / cellPx) : 0));
const cols = computed(() => (cellPx > 0 ? Math.ceil((panX + imageW - originX) / cellPx) - firstCol.value : 0));
const rows = computed(() => (cellPx > 0 ? Math.ceil((panY + imageH - originY) / cellPx) - firstRow.value : 0));

const grid = computed(() =>
  illuminationGrid({
    ambient: AMBIENT[live.darkness],
    sources: live.lights,
    minX: firstCol.value,
    minY: firstRow.value,
    cols: cols.value,
    rows: rows.value,
    samplesPerCell: SAMPLES_PER_CELL,
  }),
);

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
  paintLitVeil(
    ctx,
    {
      x: originX + firstCol.value * cellPx,
      y: originY + firstRow.value * cellPx,
      w: cols.value * cellPx,
      h: rows.value * cellPx,
    },
    grid.value,
    cols.value * SAMPLES_PER_CELL,
    rows.value * SAMPLES_PER_CELL,
    makeCanvas,
  );
  ctx.restore();
}

// Resizing a canvas clears it, and the host size is a prop, so redraw whenever any input changes.
watch(() => [hostW, hostH, panX, panY, imageW, imageH, cellPx, originX, originY, grid.value], draw, { flush: "post" });
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
