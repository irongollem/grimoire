import { DEFAULT_PRESSURE_CURVE } from "../engine/pressure";
import { beginStroke } from "../engine/stroke";
import { TiledLayer } from "../engine/tiledLayer";
import type { BrushPreset, PaintAssets, Paper, PenSample, Rgb } from "../engine/types";

/*
 * The stroke a brush paints, drawn with the real engine into a throwaway layer (#1181). The library rows, the
 * settings panel and the "dabs apart / melt into a stroke" note all show a brush through this one renderer, so
 * what the panel shows is what the canvas paints. DOM-free: it returns plain pixels and a canvas component paints
 * them.
 */

/** Straight (non-premultiplied) RGBA, row by row, transparent where nothing was painted. */
export interface PreviewPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PreviewOptions {
  width: number;
  height: number;
  colour: Rgb;
  /** The sheet the brush would be painting on: a paper-mode grain catches its tooth. */
  paper?: Paper;
  /** Replaces the tip's spacing, to show the same tip as separate dabs. */
  spacingOverride?: number;
}

const CACHE_LIMIT = 96;
const cache = new Map<string, PreviewPixels>();

/** JSON with sorted keys, so two equal brushes built in a different property order share one key. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v).sort()) out[key] = (v as Record<string, unknown>)[key];
    return out;
  });
}

/** An image tip or grain that the store has not loaded yet paints blank: such a result must not be remembered. */
function assetsReady(brush: BrushPreset, assets: PaintAssets, paper: Paper | undefined): boolean {
  if (brush.tip.source.kind === "image" && !assets.tip(brush.tip.source.id)) return false;
  if (brush.grain) {
    const id = brush.grain.mode === "paper" && paper ? paper.grainId : brush.grain.id;
    if (!assets.grain(id)) return false;
  }
  return true;
}

function flatten(layer: TiledLayer): PreviewPixels {
  const data = new Uint8ClampedArray(layer.width * layer.height * 4);
  for (const key of layer.keys()) {
    const tile = layer.tile(key);
    if (!tile) continue;
    const r = layer.tileRect(key);
    for (let y = 0; y < r.h; y++) {
      const from = y * layer.tileSize * 4;
      data.set(tile.subarray(from, from + r.w * 4), ((r.y + y) * layer.width + r.x) * 4);
    }
  }
  return { width: layer.width, height: layer.height, data };
}

function sample(x: number, y: number, pressure: number, time: number): PenSample {
  return { x, y, pressure, tiltX: 0, tiltY: 0, twist: 0, time, pointer: "pen" };
}

/** An S across the width; pressure rises from light to full in the middle and back. Exported for the test. */
export function previewSamples(width: number, height: number, size: number): PenSample[] {
  const pad = Math.min(width * 0.12, size * 0.6 + 2);
  const span = width - pad * 2;
  const amp = Math.max(0, height / 2 - size * 0.5 - 2) * 0.8;
  const count = Math.max(8, Math.ceil(span / 2));
  const out: PenSample[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    out.push(sample(pad + span * t, height / 2 - amp * Math.sin(Math.PI * 2 * t), 0.2 + 0.8 * Math.sin(Math.PI * t), i * 8));
  }
  return out;
}

function paintInto(
  brush: BrushPreset,
  assets: PaintAssets,
  o: PreviewOptions,
  size: number,
  samples: PenSample[],
): PreviewPixels {
  const layer = new TiledLayer(o.width, o.height);
  const stroke = beginStroke(
    layer,
    { brush, colour: o.colour, mode: "paint", seed: 7, curve: DEFAULT_PRESSURE_CURVE, paper: o.paper, overrides: { size } },
    assets,
  );
  stroke.add(samples);
  stroke.end();
  return flatten(layer);
}

function remembered(key: string, make: () => PreviewPixels, cacheable: boolean): PreviewPixels {
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency so the oldest entry is the one dropped.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = make();
  if (cacheable) {
    cache.set(key, made);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  }
  return made;
}

/** The brush's stroke: an S-curve with pressure 0.2 to 1 to 0.2, at a size that fits the box. */
export function renderBrushPreview(brush: BrushPreset, assets: PaintAssets, o: PreviewOptions): PreviewPixels {
  const shown = o.spacingOverride === undefined ? brush : { ...brush, tip: { ...brush.tip, spacing: o.spacingOverride } };
  const size = Math.max(1, Math.min(brush.tip.size, o.height * 0.42));
  // Id, name and group never change a stroke, so renaming a brush does not repaint its preview.
  const { id: _id, name: _name, group: _group, ...paintable } = shown;
  const key = stable({ b: paintable, w: o.width, h: o.height, c: o.colour, p: o.paper?.id, s: size, k: "stroke" });
  return remembered(key, () => paintInto(shown, assets, o, size, previewSamples(o.width, o.height, size)), assetsReady(brush, assets, o.paper));
}

/** One dab of the brush's tip, centred, at full pressure: the little square beside a library row. */
export function renderTipPreview(brush: BrushPreset, assets: PaintAssets, o: PreviewOptions): PreviewPixels {
  const size = Math.max(1, Math.min(brush.tip.size, Math.min(o.width, o.height) * 0.8));
  const { id: _id, name: _name, group: _group, ...paintable } = brush;
  const key = stable({ b: paintable, w: o.width, h: o.height, c: o.colour, p: o.paper?.id, s: size, k: "tip" });
  const dab = [sample(o.width / 2, o.height / 2, 1, 0)];
  return remembered(key, () => paintInto(brush, assets, o, size, dab), assetsReady(brush, assets, o.paper));
}
