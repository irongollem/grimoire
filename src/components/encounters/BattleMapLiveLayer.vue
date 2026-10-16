<template>
  <canvas
    ref="canvasEl"
    class="live-layer"
    :width="hostW"
    :height="hostH"
    :style="{ width: hostW + 'px', height: hostH + 'px' }"
  />
</template>

<script setup lang="ts">
// The live layer (epic #1073): a canvas over a map image, one per side of the grid (`stratum`), that animates what the published
// snapshot (`locations.map_live`) says moves. Water first; lights and vision reuse the same snapshot and canvas.
// With reduced motion, a hidden tab or nothing to animate it draws nothing and runs no loop: the baked picture
// already shows the water.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { groupsIn, hasMotion, overlayFrame, type Stratum } from "@/lib/battlemap/liveLayer";
import { prefersReducedMotion } from "@/lib/motion";
import type { MapLive, MotionOverlay } from "@/types/mapLive.types";

const { hostW, hostH, cellPx, originX, originY, live, stratum } = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  live: MapLive | null;
  /** Under the grid (`ground`: water, the open mass) or over what stands (`top`: nothing yet). */
  stratum: Stratum;
}>();

const canvasEl = ref<HTMLCanvasElement | null>(null);

// One decode per url for the whole app: every battle map of the same pack shares its foam.
const images = new Map<string, HTMLImageElement>();
function imageFor(url: string): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

let frameId: number | null = null;
let startedAt = 0;

function clear() {
  const ctx = canvasEl.value?.getContext("2d");
  ctx?.clearRect(0, 0, hostW, hostH);
}

function paintOverlay(ctx: CanvasRenderingContext2D, overlay: MotionOverlay, t: number) {
  const img = imageFor(overlay.url);
  if (!img) return;
  const frame = overlayFrame(overlay, cellPx, originX, originY, t);
  const pattern = ctx.createPattern(img, "repeat");
  if (!pattern) return;
  const sx = frame.size / img.naturalWidth;
  const sy = frame.size / img.naturalHeight;
  ctx.save();
  ctx.globalAlpha = frame.alpha;
  ctx.setTransform(sx, 0, 0, sy, frame.offsetX, frame.offsetY);
  ctx.fillStyle = pattern;
  // The clip is already in device space; the fill rect is the host, expressed in the pattern's own space.
  ctx.fillRect(-frame.offsetX / sx, -frame.offsetY / sy, hostW / sx, hostH / sy);
  ctx.restore();
}

function render(t: number) {
  const ctx = canvasEl.value?.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, hostW, hostH);
  if (!live || cellPx <= 0 || hostW <= 0 || hostH <= 0) return;
  for (const group of groupsIn(live, stratum)) {
    if (group.overlays.length === 0) continue;
    ctx.save();
    ctx.beginPath();
    for (const key of group.cells) {
      const [xs, ys] = key.split(",");
      const px = originX + Number(xs) * cellPx;
      const py = originY + Number(ys) * cellPx;
      if (px + cellPx < 0 || py + cellPx < 0 || px > hostW || py > hostH) continue;
      ctx.rect(px, py, cellPx, cellPx);
    }
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    for (const overlay of group.overlays) paintOverlay(ctx, overlay, t);
    ctx.restore();
  }
}

function tick(now: number) {
  render((now - startedAt) / 1000);
  frameId = requestAnimationFrame(tick);
}

function shouldRun(): boolean {
  return (
    typeof requestAnimationFrame === "function" &&
    hasMotion(live, stratum) &&
    cellPx > 0 &&
    !document.hidden &&
    !prefersReducedMotion()
  );
}

function stop() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
}

function sync() {
  if (shouldRun()) {
    if (frameId === null) {
      startedAt = performance.now();
      frameId = requestAnimationFrame(tick);
    }
  } else {
    stop();
    clear();
  }
}

onMounted(() => {
  document.addEventListener("visibilitychange", sync);
  sync();
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", sync);
  stop();
});

watch(() => [live, cellPx, stratum], sync);
</script>

<style scoped>
.live-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
