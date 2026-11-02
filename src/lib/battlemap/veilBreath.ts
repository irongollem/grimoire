// The lit edge of the darkness veil breathes (2 Nov 2026). What the eye reads as "the circle of light" is the edge of
// the veil, and the veil is computed once (`illuminationGrid` is a sampled grid, far too dear to redo per frame). So
// the veil stays exactly as computed and each light only works the band between its steady reach `r0` and its reach
// right now `r(t)` (`lightRadiusScale`): a swell lifts the veil in that ring, a fade lays it back, each cut to what the
// light has a clear line to (the live layer's own per-light sight mask, built at the largest swell), plus a warm halo
// of the light's own colour that swells with it. A handful of canvas ops per light per frame.

import type { MakeCanvas } from "@/cartographer/drawFrame";
import { FLICKER_REACH, lightMotion, lightReachCells, lightStops, PULSE_REACH } from "@/cartographer/lights";
import { DEFAULT_LIGHT_INTENSITY, FEET_PER_CELL } from "@/cartographer/packSchema";
import { DM_VEIL, VEIL_RGB } from "@/lib/battlemap/darkness";
import type { DarknessZone } from "@/lib/battlemap/illumination";
import type { BoostMask } from "@/lib/battlemap/liveLayer";
import { lightBoost, lightRadiusScale } from "@/lib/battlemap/liveLayer";
import type { DarknessLevel } from "@/types/dungeonMap.types";
import type { MapLiveLight } from "@/types/mapLive.types";

/** How much of the ring a full swell clears from the veil (0..1 of what is there). */
export const LIGHTEN_PEAK = 0.55;
/** How much of the veil's own colour a full fade lays back, as a fraction of the veil's strength at that ambient. */
export const DARKEN_PEAK = 0.6;
/** The ring reaches this far in from the steady edge, as a fraction of `r0`, so it reads as the edge moving, not a hoop. */
export const RING_INNER = 0.55;
/** A change in reach smaller than this fraction of a full swing draws nothing. */
const MIN_STRENGTH = 0.03;
/** A light inside another's strongly lit core (within this fraction of its reach) is not laid darker: that one keeps it lit. */
const CORE = 0.5;
/** How strong the warm halo is, as a fraction of the light's own intensity. */
const HALO_GAIN = 0.8;
/**
 * The rings and halos are soft gradients, so they are composed on a scratch canvas at this fraction of the screen
 * size and laid on scaled up with smoothing: a fraction of the pixels to fill and cut per light, which is what keeps
 * thirty breathing lights cheap even on a canvas drawn in software.
 */
export const SCRATCH_SCALE = 0.15;

export interface Breath {
  /** The steady reach, in cells. */
  r0: number;
  /** The reach now, in cells. */
  r: number;
  mode: "lighten" | "darken" | "none";
  /** 0..1: how far into a full swing of this light's kind the reach is. */
  strength: number;
}

/** Where a light's reach is against its steady one at time `t`, and which way the edge is moving. */
export function breathOf(light: MapLiveLight, t: number): Breath {
  const r0 = lightReachCells(light);
  const scale = lightRadiusScale(light, t);
  const swing = lightMotion(light).kind === "flicker" ? FLICKER_REACH : PULSE_REACH;
  const strength = Math.min(1, Math.abs(scale - 1) / swing);
  if (strength < MIN_STRENGTH) return { r0, r: r0 * scale, mode: "none", strength: 0 };
  return { r0, r: r0 * scale, mode: scale > 1 ? "lighten" : "darken", strength };
}

/** The lights that may breathe: those not standing in a sphere of magical darkness, which no light lifts. */
export function breathingLights(lights: readonly MapLiveLight[], zones: readonly DarknessZone[]): MapLiveLight[] {
  return lights.filter((l) => !zones.some((z) => Math.hypot(l.x - z.x, l.y - z.y) <= z.radius / FEET_PER_CELL));
}

/** Whether another light keeps this one's surroundings lit however it fades: it stands in that light's core. */
function inAnotherCore(lights: readonly MapLiveLight[], at: MapLiveLight): boolean {
  return lights.some((o) => o !== at && Math.hypot(o.x - at.x, o.y - at.y) <= lightReachCells(o) * CORE);
}

/** One canvas per sight mask, built once: the mask is kept per light, snapshot and set of door states. */
const maskCanvases = new WeakMap<BoostMask, HTMLCanvasElement>();
export function maskCanvasOf(held: BoostMask): HTMLCanvasElement | null {
  let canvas = maskCanvases.get(held);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = held.mask.width;
    canvas.height = held.mask.height;
    const mctx = canvas.getContext("2d");
    if (!mctx) return null;
    const image = mctx.createImageData(held.mask.width, held.mask.height);
    for (let k = 0; k < held.mask.alpha.length; k++) image.data[k * 4 + 3] = held.mask.alpha[k];
    mctx.putImageData(image, 0, 0);
    maskCanvases.set(held, canvas);
  }
  return canvas;
}

/** A light's sight mask as a canvas with the cell box it covers (image cells). */
export interface BreathMask {
  canvas: CanvasImageSource;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BreathFrame {
  lights: readonly MapLiveLight[];
  t: number;
  cellPx: number;
  /** Host px of image cell (0,0). */
  originX: number;
  originY: number;
  hostW: number;
  hostH: number;
  darkness: DarknessLevel;
  maskOf: (light: MapLiveLight) => BreathMask | null;
  /**
   * Where the ring may lift the veil. Absent: everywhere (the DM sees all). A canvas the size of the host, opaque where
   * a viewer sees: a player's veil is opaque where nothing is seen and a lifted ring would leak it. Null: nowhere.
   */
  limit?: CanvasImageSource | null;
}

type Scratch = Pick<
  CanvasRenderingContext2D,
  "clearRect" | "createRadialGradient" | "fillRect" | "drawImage" | "globalCompositeOperation" | "imageSmoothingEnabled"
> & { fillStyle: CanvasRenderingContext2D["fillStyle"] };
type Target = Pick<CanvasRenderingContext2D, "save" | "restore" | "drawImage" | "globalCompositeOperation" | "imageSmoothingEnabled">;

type Grown = { canvas: CanvasImageSource & { width: number; height: number }; ctx: Scratch };

/**
 * The painter composes each light on one scratch canvas, and gathers them on three more, one per way of laying them
 * on: the rings that lift the veil, the rings that lay it back, and the halos. Each gathering then goes onto the veil
 * in a single draw. Laying every light straight onto the veil cost about half a millisecond a draw on a screen-sized
 * canvas, two or three draws a light, every frame. All four canvases only grow and are used from their top-left
 * corner: resizing a canvas reallocates it.
 */
export function createVeilBreath(makeCanvas: MakeCanvas) {
  const held: Record<"scratch" | "lift" | "lay" | "glow", Grown | null> = { scratch: null, lift: null, lay: null, glow: null };

  function grown(slot: keyof typeof held, w: number, h: number): Grown | null {
    let c = held[slot];
    if (!c) {
      const made = makeCanvas(w, h);
      if (!made) return null;
      c = { canvas: made.canvas as Grown["canvas"], ctx: made.ctx };
      held[slot] = c;
    }
    if (c.canvas.width < w) c.canvas.width = w;
    if (c.canvas.height < h) c.canvas.height = h;
    return c;
  }

  /** Cut what is in the scratch to the light's sight (and, for a player, to what they see). */
  function cut(g: Scratch, mask: BreathMask, cellPx: number, left: number, top: number, f: BreathFrame, limit: CanvasImageSource | null | undefined) {
    g.globalCompositeOperation = "destination-in";
    g.imageSmoothingEnabled = true;
    g.drawImage(mask.canvas, 0, 0, (mask.x1 - mask.x0) * cellPx * SCRATCH_SCALE, (mask.y1 - mask.y0) * cellPx * SCRATCH_SCALE);
    if (limit) g.drawImage(limit, -left * SCRATCH_SCALE, -top * SCRATCH_SCALE, f.hostW * SCRATCH_SCALE, f.hostH * SCRATCH_SCALE);
  }

  type Job = { light: MapLiveLight; b: Breath; mask: BreathMask; left: number; top: number; w: number; h: number; ring: "lift" | "lay" | null; halo: boolean };

  /** Draw every breathing light's ring and halo over `ctx`, which already holds the static veil. Returns lights drawn. */
  function paint(ctx: Target, f: BreathFrame): number {
    const alphaScale = DM_VEIL[f.darkness] / DM_VEIL.dark;
    const jobs: Job[] = [];
    let ux0 = Infinity;
    let uy0 = Infinity;
    let ux1 = -Infinity;
    let uy1 = -Infinity;
    for (const light of f.lights) {
      const b = breathOf(light, f.t);
      if (b.mode === "none") continue;
      const cx = f.originX + light.x * f.cellPx;
      const cy = f.originY + light.y * f.cellPx;
      const reachPx = Math.max(b.r, b.r0) * f.cellPx;
      if (cx + reachPx < 0 || cy + reachPx < 0 || cx - reachPx > f.hostW || cy - reachPx > f.hostH) continue;
      const mask = f.maskOf(light);
      if (!mask) continue;
      const left = f.originX + mask.x0 * f.cellPx;
      const top = f.originY + mask.y0 * f.cellPx;
      const w = Math.ceil((mask.x1 - mask.x0) * f.cellPx);
      const h = Math.ceil((mask.y1 - mask.y0) * f.cellPx);
      if (w <= 0 || h <= 0) continue;
      // The veil lifts between the steady edge and the swollen one; a light drawn in lays it back, unless it stands in
      // another light's core, which keeps it lit. A player's veil (`limit` null: nothing seen) is never lifted.
      const ring = b.mode === "lighten" ? (f.limit !== null ? "lift" : null) : inAnotherCore(f.lights, light) ? null : "lay";
      const halo = f.limit !== null;
      jobs.push({ light, b, mask, left, top, w, h, ring, halo });
      ux0 = Math.min(ux0, left);
      uy0 = Math.min(uy0, top);
      ux1 = Math.max(ux1, left + w);
      uy1 = Math.max(uy1, top + h);
    }
    if (jobs.length === 0) return 0;

    const aw = Math.max(1, Math.ceil((ux1 - ux0) * SCRATCH_SCALE));
    const ah = Math.max(1, Math.ceil((uy1 - uy0) * SCRATCH_SCALE));
    const used = { lift: false, lay: false, glow: false };
    const gather = (slot: "lift" | "lay" | "glow", sw: number, sh: number, left: number, top: number) => {
      const into = grown(slot, aw, ah);
      const from = held.scratch;
      if (!into || !from) return;
      if (!used[slot]) {
        into.ctx.globalCompositeOperation = "source-over";
        into.ctx.clearRect(0, 0, into.canvas.width, into.canvas.height);
        used[slot] = true;
      }
      // Rings pile up as one veil would (over); halos add light as the veil's own screen would.
      into.ctx.globalCompositeOperation = slot === "glow" ? "screen" : "source-over";
      into.ctx.drawImage(from.canvas, 0, 0, sw, sh, (left - ux0) * SCRATCH_SCALE, (top - uy0) * SCRATCH_SCALE, sw, sh);
    };

    for (const { light, b, mask, left, top, w, h, ring, halo } of jobs) {
      const sw = Math.max(1, Math.ceil(w * SCRATCH_SCALE));
      const sh = Math.max(1, Math.ceil(h * SCRATCH_SCALE));
      const s = grown("scratch", sw, sh);
      if (!s) continue;
      const g = s.ctx;
      const gx = (f.originX + light.x * f.cellPx - left) * SCRATCH_SCALE;
      const gy = (f.originY + light.y * f.cellPx - top) * SCRATCH_SCALE;

      if (ring === "lift") {
        // The veil lifts between the steady edge and the swollen one, strongest at the old edge.
        g.globalCompositeOperation = "source-over";
        g.clearRect(0, 0, sw, sh);
        const grad = g.createRadialGradient(gx, gy, 0, gx, gy, b.r * f.cellPx * SCRATCH_SCALE);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop((b.r0 * RING_INNER) / b.r, "rgba(0,0,0,0)");
        grad.addColorStop(b.r0 / b.r, `rgba(0,0,0,${LIGHTEN_PEAK * b.strength})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, sw, sh);
        cut(g, mask, f.cellPx, left, top, f, f.limit);
        gather("lift", sw, sh, left, top);
      } else if (ring === "lay") {
        // The light drew in: the ring between its reach now and its steady one goes back to the ambient veil.
        g.globalCompositeOperation = "source-over";
        g.clearRect(0, 0, sw, sh);
        const grad = g.createRadialGradient(gx, gy, 0, gx, gy, b.r0 * f.cellPx * SCRATCH_SCALE);
        const [r, gr, bl] = VEIL_RGB;
        const peak = DARKEN_PEAK * b.strength * alphaScale;
        grad.addColorStop(0, `rgba(${r},${gr},${bl},0)`);
        grad.addColorStop((b.r * RING_INNER) / b.r0, `rgba(${r},${gr},${bl},0)`);
        grad.addColorStop(b.r / b.r0, `rgba(${r},${gr},${bl},${peak * 0.8})`);
        grad.addColorStop(1, `rgba(${r},${gr},${bl},${peak})`);
        g.fillStyle = grad;
        g.fillRect(0, 0, sw, sh);
        cut(g, mask, f.cellPx, left, top, f, undefined);
        gather("lay", sw, sh, left, top);
      }

      // The warm halo: the light's own colour, swelling and fading with its reach and brightness.
      if (halo) {
        const intensity = (light.intensity ?? DEFAULT_LIGHT_INTENSITY) * HALO_GAIN * (0.4 + 0.6 * lightBoost(light, f.t));
        g.globalCompositeOperation = "source-over";
        g.clearRect(0, 0, sw, sh);
        const grad = g.createRadialGradient(gx, gy, 0, gx, gy, b.r * f.cellPx * SCRATCH_SCALE);
        for (const [offset, color] of lightStops({ color: light.color, bright: light.bright, dim: light.dim, intensity })) {
          grad.addColorStop(offset, color);
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, sw, sh);
        cut(g, mask, f.cellPx, left, top, f, f.limit);
        gather("glow", sw, sh, left, top);
      }
    }

    // Lifted first, then laid back, then the halos over both, each in one draw.
    for (const [slot, op] of [["lift", "destination-out"], ["lay", "source-over"], ["glow", "screen"]] as const) {
      const c = held[slot];
      if (!used[slot] || !c) continue;
      ctx.save();
      ctx.globalCompositeOperation = op;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(c.canvas, 0, 0, aw, ah, ux0, uy0, aw / SCRATCH_SCALE, ah / SCRATCH_SCALE);
      ctx.restore();
    }
    return jobs.length;
  }

  return { paint };
}

