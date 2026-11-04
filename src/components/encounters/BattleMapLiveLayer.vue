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
// The top layer also draws every door leaf that has art of its own, at the state the DM left the door in (the standing
// image leaves those out), before the sprites: doors sit in the wall band and props stand in front of it.
// With reduced motion, a hidden tab or nothing to animate, the ground layer draws nothing and runs no loop: the baked
// picture already shows the water. The top layer then draws ONE still frame (sprites at rest, leaves) and redraws it
// when the doors, the pan, the size or the snapshot change, because its standing image has already dropped them.
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { paintDoorLeaf, edgeTileOrigin } from "@/cartographer/doorLeaf";
import { effectiveDoors } from "@/lib/battlemap/doors";
import { segmentAxis } from "@/lib/battlemap/walls";
import { NO_DOOR_STATES } from "@/lib/battlemap/occlusion";
import { clipGroundMotion } from "@/lib/battlemap/groundMotionClip";
import { boostMask, groupsIn, hasMotion, lightBoost, lightRadiusScale, lightsIn, overlayFrame, spritesIn, swayAngle, type Stratum } from "@/lib/battlemap/liveLayer";
import { LIGHT_BOOST_GAIN, lightMotion, lightReachCells, lightStops } from "@/cartographer/lights";
import { DEFAULT_LIGHT_INTENSITY } from "@/cartographer/packSchema";
import { maskCanvasOf } from "@/lib/battlemap/veilBreath";
import { prefersReducedMotion } from "@/lib/motion";
import type { MapLive, MapLiveDoor, MapLiveDoorState, MapLiveLight, MapLiveSprite, MotionOverlay } from "@/types/mapLive.types";

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
  doorStates = NO_DOOR_STATES,
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
  /** The DM's door overrides (#1073): a door's leaf is drawn at its state in play, a flicker is masked by open doors. */
  doorStates?: readonly MapLiveDoorState[];
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

type LeafDoor = MapLiveDoor & { leaf: NonNullable<MapLiveDoor["leaf"]> };

/** The top layer's doors that carry art of their own, at the state they have in play. */
function leafDoors(): LeafDoor[] {
  if (!live || stratum !== "top") return [];
  return effectiveDoors(live.doors, doorStates).filter((d): d is LeafDoor => d.leaf !== null);
}

function readyUrls(): Set<string> {
  const urls = new Set(spritesIn(live, stratum).map((sp) => sp.url));
  if (live && stratum === "top") for (const d of live.doors) if (d.leaf) urls.add(d.leaf.url);
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

function paintLeaf(ctx: CanvasRenderingContext2D, door: LeafDoor) {
  if (readyFor !== live) return;
  const img = imageFor(door.leaf.url);
  if (!img) return;
  // The leaf art is drawn for a doorway on a grid line; an angled door has none yet.
  const axis = segmentAxis(door.a, door.b);
  if (!axis) return;
  const tile = edgeTileOrigin(
    axis,
    originX + Math.min(door.a[0], door.b[0]) * cellPx,
    originY + Math.min(door.a[1], door.b[1]) * cellPx,
    cellPx,
  );
  if (tile.x + cellPx * 2 < 0 || tile.y + cellPx * 2 < 0 || tile.x - cellPx > hostW || tile.y - cellPx > hostH) return;
  paintDoorLeaf(ctx, img, axis, tile.x, tile.y, cellPx, door.leaf, door.open);
}

function paintSprite(ctx: CanvasRenderingContext2D, sprite: MapLiveSprite, t: number, still: boolean) {
  if (readyFor !== live) return;
  const img = imageFor(sprite.url);
  if (!img) return;
  const cx = originX + sprite.x * cellPx;
  const cy = originY + sprite.y * cellPx;
  const reach = Math.max(sprite.w, sprite.h) * cellPx;
  if (cx + reach < 0 || cy + reach < 0 || cx - reach > hostW || cy - reach > hostH) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((sprite.rotation + (still ? 0 : swayAngle(sprite.sway, t))) * Math.PI) / 180);
  ctx.drawImage(img, (-sprite.w * cellPx) / 2, (-sprite.h * cellPx) / 2, sprite.w * cellPx, sprite.h * cellPx);
  ctx.restore();
}

// The glow is soft (a gradient cut by a mask sampled a few times per cell), so it is composed at a few pixels per cell
// and scaled up smooth, never at the map's own resolution: at 128 px a cell a fire's square was 2,000 px wide, redrawn
// three times a frame per light, which held the editor and the battle map to a handful of frames a second.
const BOOST_PX_PER_CELL = 12;
/** The longest side the composed glow may have, so a sprawling map cannot ask for a huge canvas each frame. */
const BOOST_MAX_PX = 2048;

// Two canvases that only ever grow: one light is composed in `scratch`, every light is gathered in `accum`, and the
// whole of `accum` goes onto the layer in one draw. A canvas that is resized is reallocated, so neither shrinks.
let scratch: HTMLCanvasElement | null = null;
let accum: HTMLCanvasElement | null = null;

function grown(canvas: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const c = canvas ?? document.createElement("canvas");
  if (c.width < w) c.width = w;
  if (c.height < h) c.height = h;
  return c;
}

function maskCanvasFor(light: MapLiveLight): { canvas: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number } | null {
  if (!live) return null;
  const held = boostMask(live, light, doorStates);
  const canvas = maskCanvasOf(held);
  return canvas ? { canvas, x0: held.x0, y0: held.y0, x1: held.x1, y1: held.y1 } : null;
}

type Boost = { light: MapLiveLight; tileLight: { color: string; bright: number; dim: number; intensity: number }; radius: number; mask: NonNullable<ReturnType<typeof maskCanvasFor>> };

/**
 * The glow flickering and pulsing lights add on top of their steady baked glow. Each light's gradient (radius in cells)
 * is cut to what it can see (`destination-in` its mask, scaled up smooth as the baked glow's is) and gathered with
 * `screen` in image-cell space; the gathering is then cut once to the ground picture's painted part (when there is one:
 * waiting for it to load draws nothing) and laid on with `screen`.
 */
function paintLightBoosts(ctx: CanvasRenderingContext2D, lights: readonly MapLiveLight[], t: number) {
  const groundImg = ground ? imageFor(ground.url) : null;
  // The battle map keeps the glow to the ground picture's painted part. The editor has no such picture to hand the
  // layer (its ground is a canvas), so there the glow is cut to line of sight alone.
  if (ground && !groundImg) return;
  const boosts: Boost[] = [];
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const light of lights) {
    const intensity = (light.intensity ?? DEFAULT_LIGHT_INTENSITY) * lightMotion(light).amount * LIGHT_BOOST_GAIN * lightBoost(light, t);
    if (intensity <= 0.001) continue;
    const tileLight = { color: light.color, bright: light.bright, dim: light.dim, intensity };
    // The reach breathes with the flame; the line-of-sight mask stays the steady reach (no occlusion per frame).
    const radius = lightReachCells(tileLight) * lightRadiusScale(light, t);
    const cx = originX + light.x * cellPx;
    const cy = originY + light.y * cellPx;
    const r = radius * cellPx;
    if (cx + r < 0 || cy + r < 0 || cx - r > hostW || cy - r > hostH) continue;
    const mask = maskCanvasFor(light);
    if (!mask || mask.x1 <= mask.x0 || mask.y1 <= mask.y0) continue;
    boosts.push({ light, tileLight, radius, mask });
    bx0 = Math.min(bx0, mask.x0);
    by0 = Math.min(by0, mask.y0);
    bx1 = Math.max(bx1, mask.x1);
    by1 = Math.max(by1, mask.y1);
  }
  if (boosts.length === 0) return;

  const q = Math.min(cellPx, BOOST_PX_PER_CELL, BOOST_MAX_PX / Math.max(bx1 - bx0, by1 - by0));
  const aw = Math.ceil((bx1 - bx0) * q);
  const ah = Math.ceil((by1 - by0) * q);
  accum = grown(accum, aw, ah);
  const a = accum.getContext("2d");
  if (!a) return;
  a.globalCompositeOperation = "source-over";
  a.clearRect(0, 0, accum.width, accum.height);

  for (const { light, tileLight, radius, mask } of boosts) {
    const sw = Math.ceil((mask.x1 - mask.x0) * q);
    const sh = Math.ceil((mask.y1 - mask.y0) * q);
    scratch = grown(scratch, sw, sh);
    const g = scratch.getContext("2d");
    if (!g) return;
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, scratch.width, scratch.height);
    const gx = (light.x - mask.x0) * q;
    const gy = (light.y - mask.y0) * q;
    const gradient = g.createRadialGradient(gx, gy, 0, gx, gy, radius * q);
    for (const [offset, color] of lightStops(tileLight)) gradient.addColorStop(offset, color);
    g.fillStyle = gradient;
    g.fillRect(0, 0, sw, sh);
    g.globalCompositeOperation = "destination-in";
    g.imageSmoothingEnabled = true;
    g.drawImage(mask.canvas, 0, 0, (mask.x1 - mask.x0) * q, (mask.y1 - mask.y0) * q);
    a.globalCompositeOperation = "screen";
    a.drawImage(scratch, 0, 0, sw, sh, (mask.x0 - bx0) * q, (mask.y0 - by0) * q, sw, sh);
  }

  // Host px of the gathering's top-left cell, and how many host px one of its pixels covers.
  const left = originX + bx0 * cellPx;
  const top = originY + by0 * cellPx;
  const k = q / cellPx;
  if (ground && groundImg) {
    a.globalCompositeOperation = "destination-in";
    a.imageSmoothingEnabled = true;
    a.drawImage(groundImg, (ground.x - left) * k, (ground.y - top) * k, ground.w * k, ground.h * k);
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(accum, 0, 0, aw, ah, left, top, aw / k, ah / k);
  ctx.restore();
}

function render(t: number, still = false) {
  const ctx = canvasEl.value?.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, hostW, hostH);
  if (!live || cellPx <= 0 || hostW <= 0 || hostH <= 0) return;
  for (const group of groupsIn(live, stratum)) {
    if (group.overlays.length === 0) continue;
    ctx.save();
    clipGroundMotion(ctx, group, { cellPx, originX, originY, width: hostW, height: hostH });
    ctx.globalCompositeOperation = "screen";
    for (const overlay of group.overlays) paintOverlay(ctx, overlay, t);
    ctx.restore();
  }
  paintLightBoosts(ctx, lightsIn(live, stratum), t);
  for (const door of leafDoors()) paintLeaf(ctx, door);
  for (const sprite of spritesIn(live, stratum)) paintSprite(ctx, sprite, t, still);
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

// Whether the top layer has anything to hold on screen once ready: sprites, or leaves of doors. It draws them as one
// still frame whenever it is not running a loop (reduced motion, a hidden tab, leaves with nothing to sway).
function hasStill(): boolean {
  return stratum === "top" && readyFor === live && cellPx > 0 && (spritesIn(live, stratum).length > 0 || leafDoors().length > 0);
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
    if (hasStill()) render(0, true);
    else clear();
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

// Post-flush: resizing the canvas (hostW/hostH, bound in the template) clears it, so the still frame is drawn after.
watch(() => [live, cellPx, stratum, standUrl, doorStates, originX, originY, hostW, hostH], sync, { flush: "post" });
</script>

<style scoped>
.live-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
