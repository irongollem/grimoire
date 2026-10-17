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
// (the baked picture already holds the steady glow), each masked like the baked glow: to what the light has a clear
// line to, and to the ground picture's painted part. Over the standing picture: swaying props, drawn from their own
// art because the standing image the stack shows with this layer leaves them out; `ready` tells the stack every
// sprite image and that standing image have loaded, so it swaps only once nothing can go missing or blink. The props
// are drawn from that moment on, never before: until the swap the full standing image still holds them.
// With reduced motion, a hidden tab or nothing to animate it draws nothing and runs no loop: the baked picture
// already shows the water.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { boostMask, groupsIn, hasMotion, lightBoost, lightsIn, overlayFrame, spritesIn, swayAngle, type Stratum } from "@/lib/battlemap/liveLayer";
import { lightReachCells, lightStops } from "@/cartographer/lights";
import { DEFAULT_LIGHT_INTENSITY } from "@/cartographer/packSchema";
import { prefersReducedMotion } from "@/lib/motion";
import type { MapLive, MapLiveLight, MapLiveSprite, MotionOverlay } from "@/types/mapLive.types";

const {
  hostW,
  hostH,
  cellPx,
  originX,
  originY,
  live,
  stratum,
  standUrl = null,
  ground = null,
} = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  live: MapLive | null;
  /** Under the grid (`ground`: water, the open mass, fire glow) or over what stands (`top`: swaying props). */
  stratum: Stratum;
  /** Top only: the standing picture the stack swaps to on `ready`, which must have loaded by then too. */
  standUrl?: string | null;
  /** Ground only: the ground picture and its drawn box, whose painted part the light boost is kept to. */
  ground?: { url: string; x: number; y: number; w: number; h: number } | null;
}>();

const emit = defineEmits<{
  /** Every sprite image of this stratum and `standUrl` have loaded (never emitted when one fails, or with no sprites). */
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

// The snapshot this layer said `ready` for: its sprites are drawn only from then, when the stack has swapped to the
// standing image without them. Before (or when one never loads) the full standing image still shows every prop.
let readyFor: MapLive | null = null;

function readyUrls(): Set<string> {
  const urls = new Set(spritesIn(live, stratum).map((sp) => sp.url));
  if (urls.size > 0 && standUrl) urls.add(standUrl);
  return urls;
}

function checkReady() {
  if (!live || readyFor === live) return;
  const urls = readyUrls();
  if (urls.size === 0) return;
  for (const url of urls) {
    const img = images.get(url);
    if (!img || failed.has(url) || !img.complete || img.naturalWidth === 0) return;
  }
  readyFor = live;
  emit("ready");
  sync();
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
  if (readyFor !== live) return;
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

// One canvas per light's line-of-sight mask, and one scratch canvas the boost is composed in.
const maskCanvases = new WeakMap<MapLiveLight, HTMLCanvasElement>();
let scratch: HTMLCanvasElement | null = null;

function maskCanvasFor(light: MapLiveLight): { canvas: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number } | null {
  if (!live) return null;
  const held = boostMask(live, light);
  let canvas = maskCanvases.get(light);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = held.mask.width;
    canvas.height = held.mask.height;
    const mctx = canvas.getContext("2d");
    if (!mctx) return null;
    const image = mctx.createImageData(held.mask.width, held.mask.height);
    for (let k = 0; k < held.mask.alpha.length; k++) image.data[k * 4 + 3] = held.mask.alpha[k];
    mctx.putImageData(image, 0, 0);
    maskCanvases.set(light, canvas);
  }
  return { canvas, x0: held.x0, y0: held.y0, x1: held.x1, y1: held.y1 };
}

/**
 * The glow a flickering or pulsing light adds on top of its steady baked glow. Composed on a scratch canvas: the
 * gradient, cut to what the light can see (`destination-in` its mask, scaled up smooth as the baked glow's is) and
 * to the ground picture's painted part, then laid on with `screen`. Without the ground picture loaded there is no
 * floor on screen to brighten, so nothing is drawn.
 */
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
  const groundImg = ground ? imageFor(ground.url) : null;
  const mask = maskCanvasFor(light);
  if (!ground || !groundImg || !mask) return;

  const left = originX + mask.x0 * cellPx;
  const top = originY + mask.y0 * cellPx;
  const w = Math.ceil((mask.x1 - mask.x0) * cellPx);
  const h = Math.ceil((mask.y1 - mask.y0) * cellPx);
  if (w <= 0 || h <= 0) return;
  scratch ??= document.createElement("canvas");
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const g = scratch.getContext("2d");
  if (!g) return;
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, w, h);
  const gradient = g.createRadialGradient(cx - left, cy - top, 0, cx - left, cy - top, radius);
  for (const [offset, color] of lightStops(tileLight)) gradient.addColorStop(offset, color);
  g.fillStyle = gradient;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-in";
  g.imageSmoothingEnabled = true;
  g.drawImage(mask.canvas, 0, 0, (mask.x1 - mask.x0) * cellPx, (mask.y1 - mask.y0) * cellPx);
  g.drawImage(groundImg, ground.x - left, ground.y - top, ground.w, ground.h);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(scratch, left, top);
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

// Sprites waiting on `ready` have nothing to draw yet; water and lights never wait.
function hasDrawableMotion(): boolean {
  if (stratum === "top") return readyFor === live && hasMotion(live, stratum);
  return hasMotion(live, stratum);
}

function shouldRun(): boolean {
  return (
    typeof requestAnimationFrame === "function" &&
    hasDrawableMotion() &&
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
  for (const url of readyUrls()) watchImage(url);
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

watch(() => [live, cellPx, stratum, standUrl], sync);
</script>

<style scoped>
.live-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
