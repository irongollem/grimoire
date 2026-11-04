// The wall ribbon (#1125, curved walls): the pack's `wallSegmentH` art bent along a polyline, one slice per straight
// piece, the source offset running on from one slice to the next so the texture is continuous round a curve. Used by
// every angled wall (`drawAngledWalls.ts`), which sits in the `raised` shadow silhouette, so a curved wall throws the shadow a straight one does.

import { WALL_BAND_RATIO } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { Ctx2D } from "@/cartographer/dressing";

/** Wall tone when the pack declares no palette: the stone default the joint fallback uses. */
export const FALLBACK_TONE: readonly [number, number, number] = [40, 36, 32];

/** Overlap between neighbouring slices, as a fraction of the band, so a turn shows no wedge of gap. */
const SLICE_OVERLAP = 0.3;

export interface RibbonStrip {
  source: CanvasImageSource;
  /** Edge of the art tile in source pixels. */
  base: number;
}

/** The wall art of a pack as a strip to bend, or null when it has none (or only the placeholder): draw a stroke. */
export function ribbonStrip(r: TilePackRuntime, variant = 0): RibbonStrip | null {
  const count = r.variantCount("wallSegmentH");
  if (count === 0) return null;
  const art = r.getTile("wallSegmentH", variant < count ? variant : 0);
  return art.isPlaceholder ? null : { source: art.source, base: r.manifest.base_tile_size };
}

/** The pack's wall colour, for a wall drawn as a plain stroke. */
export function wallTone(r: TilePackRuntime | null | undefined): string {
  const [cr, cg, cb] = r?.manifest.palette?.wallSegmentH ?? FALLBACK_TONE;
  return `rgb(${cr},${cg},${cb})`;
}

export type DevicePoint = readonly [number, number];

/**
 * One slice of the ribbon from a to b (device pixels), `travelled` pixels of ribbon already behind it. Runs a little
 * past b so the next slice overlaps it.
 */
export function paintRibbonSlice(
  ctx: Ctx2D,
  strip: RibbonStrip,
  tilePx: number,
  a: DevicePoint,
  b: DevicePoint,
  travelled: number,
): void {
  const thick = tilePx * WALL_BAND_RATIO;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // Source pixels per drawn pixel; the strip sits in the middle of the tile, WALL_BAND_RATIO of its height.
  const per = strip.base / tilePx;
  const stripY = strip.base * (0.5 - WALL_BAND_RATIO / 2);
  const stripH = strip.base * WALL_BAND_RATIO;
  ctx.save();
  ctx.translate(a[0], a[1]);
  ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
  const drawLen = len + thick * SLICE_OVERLAP;
  let done = 0;
  let source = (((travelled * per) % strip.base) + strip.base) % strip.base;
  while (done < drawLen) {
    const run = Math.min(drawLen - done, Math.max((strip.base - source) / per, 1e-3));
    ctx.drawImage(strip.source, source, stripY, run * per, stripH, done, -thick / 2, run, thick);
    done += run;
    source = (source + run * per) % strip.base;
  }
  ctx.restore();
}

/** A segment as a plain band in `tone`, round at both ends. */
export function strokeBand(ctx: Ctx2D, tilePx: number, a: DevicePoint, b: DevicePoint, tone: string, width = tilePx * WALL_BAND_RATIO): void {
  ctx.save();
  ctx.strokeStyle = tone;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}

export interface RibbonPathOptions {
  /** Device pixels of ribbon behind the first point, so a wall can carry on the texture of the one before it. */
  startPx?: number;
  /** Reach half a band past the first / last point: a wall that ends there is capped, and walls meeting at a corner cover each other's wedge. */
  capStart?: boolean;
  capEnd?: boolean;
}

/** A polyline (device pixels) drawn as ribbon, or as a plain band in `tone` when there is no art. */
export function paintRibbonPath(
  ctx: Ctx2D,
  points: readonly DevicePoint[],
  strip: RibbonStrip | null,
  tilePx: number,
  tone: string,
  opts: RibbonPathOptions = {},
): void {
  const thick = tilePx * WALL_BAND_RATIO;
  const last = points.length - 2;
  let travelled = opts.startPx ?? 0;
  for (let i = 0; i <= last; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const before = i === 0 && opts.capStart ? thick / 2 : 0;
    const after = i === last && opts.capEnd ? thick / 2 : 0;
    const from: DevicePoint = [a[0] - ux * before, a[1] - uy * before];
    const to: DevicePoint = [b[0] + ux * after, b[1] + uy * after];
    if (strip) paintRibbonSlice(ctx, strip, tilePx, from, to, travelled - before);
    else strokeBand(ctx, tilePx, from, to, tone);
    travelled += len;
  }
}
