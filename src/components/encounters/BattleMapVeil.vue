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
// `lib/battlemap/illumination.ts`). The grid is computed once; what moves is the lit edge: each frame the static veil
// is laid down again and every light's ring between its steady reach and its reach now is lifted or laid back
// (`lib/battlemap/veilBreath.ts`). Reduced motion, a hidden tab or a map without lights runs no loop and gets the same
// still picture as ever. The stack mounts it last, so room focus, tokens and fog stay above it.
//
// Magical darkness (story 10) is an input to both grids; the DM's veil also rings each sphere in a dashed line.
//
// The DM sees the whole map under a translucent veil (`viewers` null, `paintLitVeil`). A player sees through their own
// token (`viewers` set, `paintPlayerVeil`): what it cannot see is opaque, what it sees dimly is lightly veiled, and
// where darkvision reaches into darkness the map's pictures show in grey (`lib/battlemap/vision.ts`). The grey needs
// the stack's pictures as loaded images; until they arrive the veil is drawn without it and redrawn on load.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { domMakeCanvas, paintLitVeil, paintPlayerVeil, paintZoneRings, seenLimit, type GreyImage } from "@/lib/battlemap/darkness";
import { AMBIENT, illuminationGrid, NO_ZONES, type DarknessZone } from "@/lib/battlemap/illumination";
import { NO_DOOR_STATES, occludersOf } from "@/lib/battlemap/occlusion";
import { boostMask } from "@/lib/battlemap/liveLayer";
import { visionGrid, type Viewer } from "@/lib/battlemap/vision";
import { breathingLights, createVeilBreath, maskCanvasOf, type BreathMask } from "@/lib/battlemap/veilBreath";
import { prefersReducedMotion } from "@/lib/motion";
import type { MapLiveLight } from "@/types/mapLive.types";
import type { MapLive, MapLiveDoorState } from "@/types/mapLive.types";

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
  zones = NO_ZONES,
  doorStates = NO_DOOR_STATES,
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
  /** Magical darkness: nothing in it is lit, and the DM sees each sphere's edge as a dashed ring. */
  zones?: readonly DarknessZone[];
  /** Doors the DM opened or shut over their drawn state (#1073): an open door lets light and sight through. */
  doorStates?: readonly MapLiveDoorState[];
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

// Walls, closed doors (at the state the DM left them in) and solid rock stop light and sight; built once per snapshot
// and set of door states.
const occluders = computed(() => occludersOf(live, doorStates));

// The zones arrive as a fresh array on every re-read of the encounter state; an equal set keeps the previous one.
const sameZones = (a: readonly DarknessZone[], b: readonly DarknessZone[]) =>
  a.length === b.length && a.every((z, i) => z.x === b[i].x && z.y === b[i].y && z.radius === b[i].radius);
const stableZones = computed<readonly DarknessZone[]>((prev) => (prev && sameZones(prev, zones) ? prev : zones));

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
    zones: stableZones.value,
  }),
);

// Viewers arrive as a fresh array whenever the encounter state is pushed; sight only changes when one moves or its
// range does, so an equal set keeps the previous array and the vision grid below is not rebuilt.
const sameViewers = (a: readonly Viewer[], b: readonly Viewer[]) =>
  a.length === b.length && a.every((v, i) => v.x === b[i].x && v.y === b[i].y && v.darkvisionFeet === b[i].darkvisionFeet &&
      v.blindsightFeet === b[i].blindsightFeet &&
      v.truesightFeet === b[i].truesightFeet &&
      v.devilsSightFeet === b[i].devilsSightFeet,
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
        zones: stableZones.value,
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

/** The veil as it stands: the lit grid (or the player's sight), clipped to the image. */
function paintStatic(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, hostW, hostH);
  if (cols.value <= 0 || rows.value <= 0) return;
  ctx.save();
  // The grid is whole cells and may overhang the image by up to one; the veil covers exactly the map.
  ctx.beginPath();
  ctx.rect(panX, panY, imageW, imageH);
  ctx.clip();
  const rect = gridRect();
  const gridW = cols.value * SAMPLES_PER_CELL;
  const gridH = rows.value * SAMPLES_PER_CELL;
  if (vision.value) paintPlayerVeil(ctx, rect, vision.value, gridW, gridH, makeCanvas, greyImages());
  else {
    paintLitVeil(ctx, rect, grid.value, gridW, gridH, makeCanvas);
    paintZoneRings(ctx, stableZones.value, originX, originY, cellPx);
  }
  ctx.restore();
}

function gridRect() {
  return {
    x: originX + firstCol.value * cellPx,
    y: originY + firstRow.value * cellPx,
    w: cols.value * cellPx,
    h: rows.value * cellPx,
  };
}

// The lights whose edge breathes: none standing in magical darkness, none on a map that has no veil to lift.
const lights = computed<MapLiveLight[]>(() => breathingLights(live.lights, stableZones.value));
const breath = createVeilBreath(makeCanvas);
// The static veil is kept on a canvas of its own while the edge breathes, and re-laid each frame.
let staticCanvas: HTMLCanvasElement | null = null;
// For a player: where the ring may lift the veil (only where something is seen).
let limit: CanvasImageSource | null | undefined;
let frameId: number | null = null;
let startedAt = 0;

function animating(): boolean {
  return (
    lights.value.length > 0 &&
    cellPx > 0 &&
    typeof requestAnimationFrame === "function" &&
    !document.hidden &&
    !prefersReducedMotion()
  );
}

function maskOf(light: MapLiveLight): BreathMask | null {
  const held = boostMask(live, light, doorStates);
  const canvas = maskCanvasOf(held);
  return canvas ? { canvas, x0: held.x0, y0: held.y0, x1: held.x1, y1: held.y1 } : null;
}

function compose(t: number): void {
  const ctx = canvasEl.value?.getContext("2d");
  if (!ctx || !staticCanvas) return;
  ctx.clearRect(0, 0, hostW, hostH);
  ctx.drawImage(staticCanvas, 0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(panX, panY, imageW, imageH);
  ctx.clip();
  breath.paint(ctx, {
    lights: lights.value,
    t,
    cellPx,
    originX,
    originY,
    hostW,
    hostH,
    darkness: live.darkness,
    maskOf,
    limit,
  });
  ctx.restore();
}

function tick(now: number): void {
  compose((now - startedAt) / 1000);
  frameId = requestAnimationFrame(tick);
}

function stop(): void {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
}

function draw(): void {
  const ctx = canvasEl.value?.getContext("2d");
  if (!ctx) return;
  if (!animating()) {
    stop();
    paintStatic(ctx);
    return;
  }
  if (!staticCanvas) staticCanvas = document.createElement("canvas");
  // Resizing clears a canvas, so only when the host size really changed.
  if (staticCanvas.width !== hostW) staticCanvas.width = hostW;
  if (staticCanvas.height !== hostH) staticCanvas.height = hostH;
  const sctx = staticCanvas.getContext("2d");
  if (!sctx) return;
  paintStatic(sctx);
  limit = vision.value
    ? seenLimit(gridRect(), vision.value.seen, cols.value * SAMPLES_PER_CELL, rows.value * SAMPLES_PER_CELL, hostW, hostH, makeCanvas)
    : undefined;
  if (frameId === null) {
    startedAt = performance.now();
    frameId = requestAnimationFrame(tick);
  }
  compose((performance.now() - startedAt) / 1000);
}

// Resizing a canvas clears it, and the host size is a prop, so redraw whenever any input changes.
watch(
  () => [hostW, hostH, panX, panY, imageW, imageH, cellPx, originX, originY, grid.value, vision.value, stableZones.value, loadedImages.value],
  draw,
  { flush: "post" },
);
// A hidden tab stops the loop and comes back to a drawn frame.
onMounted(() => {
  document.addEventListener("visibilitychange", draw);
  draw();
});
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", draw);
  stop();
  canvasEl.value?.getContext("2d")?.clearRect(0, 0, hostW, hostH);
});
</script>

<style scoped>
.veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
