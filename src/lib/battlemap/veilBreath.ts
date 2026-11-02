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

/** The painter keeps one scratch canvas, resized to the biggest light box it has been asked for. */
export function createVeilBreath(makeCanvas: MakeCanvas) {
  let scratch: { canvas: CanvasImageSource & { width: number; height: number }; ctx: Scratch } | null = null;

  function scratchOf(w: number, h: number): Scratch | null {
    if (!scratch) {
      const made = makeCanvas(w, h);
      if (!made) return null;
      scratch = { canvas: made.canvas as CanvasImageSource & { width: number; height: number }, ctx: made.ctx };
    }
    if (scratch.canvas.width !== w || scratch.canvas.height !== h) {
      scratch.canvas.width = w;
      scratch.canvas.height = h;
    }
    return scratch.ctx;
  }

  /** Cut what is in the scratch to the light's sight (and, for a player, to what they see). */
  function cut(g: Scratch, mask: BreathMask, cellPx: number, left: number, top: number, f: BreathFrame, limit: CanvasImageSource | null | undefined) {
    g.globalCompositeOperation = "destination-in";
    g.imageSmoothingEnabled = true;
    g.drawImage(mask.canvas, 0, 0, (mask.x1 - mask.x0) * cellPx * SCRATCH_SCALE, (mask.y1 - mask.y0) * cellPx * SCRATCH_SCALE);
    if (limit) g.drawImage(limit, -left * SCRATCH_SCALE, -top * SCRATCH_SCALE, f.hostW * SCRATCH_SCALE, f.hostH * SCRATCH_SCALE);
  }

  /** Lay the scratch onto the veil canvas with `op`. */
  function lay(ctx: Target, g: { canvas: CanvasImageSource }, op: GlobalCompositeOperation, left: number, top: number, w: number, h: number) {
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(g.canvas, left, top, w, h);
    ctx.restore();
  }

  /** Draw every breathing light's ring and halo over `ctx`, which already holds the static veil. Returns lights drawn. */
  function paint(ctx: Target, f: BreathFrame): number {
    const alphaScale = DM_VEIL[f.darkness] / DM_VEIL.dark;
    let drawn = 0;
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
      const sw = Math.max(1, Math.ceil(w * SCRATCH_SCALE));
      const sh = Math.max(1, Math.ceil(h * SCRATCH_SCALE));
      const g = scratchOf(sw, sh);
      if (!g || !scratch) continue;
      const gx = (cx - left) * SCRATCH_SCALE;
      const gy = (cy - top) * SCRATCH_SCALE;

      if (b.mode === "lighten") {
        if (f.limit !== null) {
          // The veil lifts between the steady edge and the swollen one, strongest at the old edge.
          g.globalCompositeOperation = "source-over";
          g.clearRect(0, 0, sw, sh);
          const outer = b.r * f.cellPx * SCRATCH_SCALE;
          const grad = g.createRadialGradient(gx, gy, 0, gx, gy, outer);
          grad.addColorStop(0, "rgba(0,0,0,0)");
          grad.addColorStop((b.r0 * RING_INNER) / b.r, "rgba(0,0,0,0)");
          grad.addColorStop(b.r0 / b.r, `rgba(0,0,0,${LIGHTEN_PEAK * b.strength})`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = grad;
          g.fillRect(0, 0, sw, sh);
          cut(g, mask, f.cellPx, left, top, f, f.limit);
          lay(ctx, scratch, "destination-out", left, top, w, h);
        }
      } else if (!inAnotherCore(f.lights, light)) {
        // The light drew in: the ring between its reach now and its steady one goes back to the ambient veil.
        g.globalCompositeOperation = "source-over";
        g.clearRect(0, 0, sw, sh);
        const outer = b.r0 * f.cellPx * SCRATCH_SCALE;
        const grad = g.createRadialGradient(gx, gy, 0, gx, gy, outer);
        const [r, gr, bl] = VEIL_RGB;
        const peak = DARKEN_PEAK * b.strength * alphaScale;
        grad.addColorStop(0, `rgba(${r},${gr},${bl},0)`);
        grad.addColorStop((b.r * RING_INNER) / b.r0, `rgba(${r},${gr},${bl},0)`);
        grad.addColorStop(b.r / b.r0, `rgba(${r},${gr},${bl},${peak * 0.8})`);
        grad.addColorStop(1, `rgba(${r},${gr},${bl},${peak})`);
        g.fillStyle = grad;
        g.fillRect(0, 0, sw, sh);
        cut(g, mask, f.cellPx, left, top, f, undefined);
        lay(ctx, scratch, "source-over", left, top, w, h);
      }

      // The warm halo: the light's own colour, swelling and fading with its reach and brightness.
      if (f.limit !== null) {
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
        lay(ctx, scratch, "screen", left, top, w, h);
      }
      drawn++;
    }
    return drawn;
  }

  return { paint };
}

