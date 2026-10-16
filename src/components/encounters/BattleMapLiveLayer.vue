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
// snapshot (`locations.map_live`) says moves. Under the grid: water, and the extra glow of fires and pulsing lights
// (the baked picture already holds the steady glow). Over the standing picture: swaying props, drawn from their own
// art because the standing image the stack shows with this layer leaves them out; `ready` tells the stack every
// sprite image has loaded, so it swaps to that image only once nothing can go missing.
// With reduced motion, a hidden tab or nothing to animate it draws nothing and runs no loop: the baked picture
// already shows the water.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { groupsIn, hasMotion, lightBoost, lightsIn, overlayFrame, spritesIn, swayAngle, type Stratum } from "@/lib/battlemap/liveLayer";
import { lightReachCells, lightStops } from "@/cartographer/lights";
import { DEFAULT_LIGHT_INTENSITY } from "@/cartographer/packSchema";
import { prefersReducedMotion } from "@/lib/motion";
import type { MapLive, MapLiveLight, MapLiveSprite, MotionOverlay } from "@/types/mapLive.types";

const { hostW, hostH, cellPx, originX, originY, live, stratum } = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  live: MapLive | null;
  /** Under the grid (`ground`: water, the open mass, fire glow) or over what stands (`top`: swaying props). */
  stratum: Stratum;
}>();

const emit = defineEmits<{
  /** Every sprite image of this stratum has loaded (never emitted when one fails, or when there are none). */
  ready: [];
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

// Sprites need to know when they are decoded, not only whether they are yet: the stack swaps its standing image on it.
const failed = new Set<string>();
function watchImage(url: string) {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    images.set(url, img);
    img.addEventListener("error", () => failed.add(url));
    img.src = url;
  }
  if (!img.complete) {
    img.addEventListener("load", checkReady, { once: true });
    img.addEventListener("error", checkReady, { once: true });
  }
}

function checkReady() {
  const sprites = spritesIn(live, stratum);
  if (sprites.length === 0) return;
  const urls = new Set(sprites.map((sp) => sp.url));
  for (const url of urls) {
    const img = images.get(url);
    if (!img || failed.has(url) || !img.complete || img.naturalWidth === 0) return;
  }
  emit("ready");
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

function paintSprite(ctx: CanvasRenderingContext2D, sprite: MapLiveSprite, t: number) {
  const img = imageFor(sprite.url);
  if (!img) return;
  const cx = originX + sprite.x * cellPx;
  const cy = originY + sprite.y * cellPx;
  const reach = Math.max(sprite.w, sprite.h) * cellPx;
  if (cx + reach < 0 || cy + reach < 0 || cx - reach > hostW || cy - reach > hostH) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((sprite.rotation + swayAngle(sprite.sway, t)) * Math.PI) / 180);
  ctx.drawImage(img, (-sprite.w * cellPx) / 2, (-sprite.h * cellPx) / 2, sprite.w * cellPx, sprite.h * cellPx);
  ctx.restore();
}

/** The glow a flickering or pulsing light adds on top of its steady baked glow. */
function paintLightBoost(ctx: CanvasRenderingContext2D, light: MapLiveLight, t: number) {
  const fraction = light.flicker ?? light.pulse;
  if (fraction === undefined) return;
  const intensity = (light.intensity ?? DEFAULT_LIGHT_INTENSITY) * fraction * lightBoost(light, t);
  if (intensity <= 0.001) return;
  const tileLight = { color: light.color, bright: light.bright, dim: light.dim, intensity };
  const radius = lightReachCells(tileLight) * cellPx;
  const cx = originX + light.x * cellPx;
  const cy = originY + light.y * cellPx;
  if (cx + radius < 0 || cy + radius < 0 || cx - radius > hostW || cy - radius > hostH) return;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  for (const [offset, color] of lightStops(tileLight)) gradient.addColorStop(offset, color);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
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
  for (const light of lightsIn(live, stratum)) paintLightBoost(ctx, light, t);
  for (const sprite of spritesIn(live, stratum)) paintSprite(ctx, sprite, t);
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
  for (const sprite of spritesIn(live, stratum)) watchImage(sprite.url);
  checkReady();
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
