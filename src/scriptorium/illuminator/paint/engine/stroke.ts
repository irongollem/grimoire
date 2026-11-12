import { blendPixel } from "./blend";
import { type DabSpec, DabGenerator } from "./dabs";
import { createRng } from "./rng";
import type { TiledLayer } from "./tiledLayer";
import { type TipDab, makeDab } from "./tip";
import type { BrushPreset, GrainImage, PaintAssets, Paper, PenSample, PressureCurve, Rgb, StrokeMode } from "./types";

/** What a stroke changed, kept so it can be undone: each tile as it was (null if it did not exist). */
export interface UndoRecord {
  tiles: Map<number, Uint8ClampedArray | null>;
}

export interface StrokeOptions {
  brush: BrushPreset;
  colour: Rgb;
  mode: StrokeMode;
  seed: number;
  curve: PressureCurve;
  /** The sheet being painted on: a paper-mode grain uses its grain image, and its tooth scales the grain depth. */
  paper?: Paper;
  /** The options bar's values, replacing the brush's own. */
  overrides?: { size?: number; opacity?: number; flow?: number };
}

export interface Stroke {
  /** Lays the dabs these samples make; returns the tile keys that changed, for the renderer to redraw. */
  add(samples: PenSample[]): number[];
  /** Finishes the stroke, drops its buffers and returns what undo needs. */
  end(): UndoRecord;
}

/** How far wet edges look, in pixels. */
const WET_RADIUS = 4;
const WET_GAIN = 3;

interface Carry {
  r: number;
  g: number;
  b: number;
  a: number;
}

class PaintStroke implements Stroke {
  private readonly layer: TiledLayer;
  private readonly brush: BrushPreset;
  private readonly colour: Rgb;
  private readonly mode: StrokeMode;
  private readonly gen: DabGenerator;
  private readonly assets: PaintAssets;
  private readonly grain: GrainImage | undefined;
  private readonly grainDepth: number;
  private readonly baseFlow: number;
  private readonly cap: number;
  private readonly buffered: boolean;
  private readonly before = new Map<number, Uint8ClampedArray | null>();
  private readonly buffers = new Map<number, Float32Array>();
  private readonly colours = new Map<number, Float32Array>();
  private carry: Carry | null = null;

  constructor(layer: TiledLayer, o: StrokeOptions, assets: PaintAssets) {
    this.layer = layer;
    this.brush = o.brush;
    this.colour = o.colour;
    this.mode = o.mode;
    this.assets = assets;
    this.gen = new DabGenerator({
      brush: o.brush,
      colour: o.colour,
      curve: o.curve,
      rng: createRng(o.seed),
      size: o.overrides?.size,
    });
    const g = o.brush.grain;
    const onPaper = g?.mode === "paper" && o.paper !== undefined;
    this.grain = g ? assets.grain(onPaper && o.paper ? o.paper.grainId : g.id) : undefined;
    this.grainDepth = g ? g.depth * (onPaper && o.paper ? o.paper.tooth : 1) : 0;
    this.baseFlow = o.overrides?.flow ?? o.brush.transfer.flow;
    this.cap = o.overrides?.opacity ?? o.brush.transfer.opacity;
    this.buffered = o.mode === "erase" || (o.mode === "paint" && !o.brush.wetMix);
  }

  add(samples: PenSample[]): number[] {
    return this.lay(this.gen.add(samples));
  }

  end(): UndoRecord {
    this.lay(this.gen.finish());
    const record: UndoRecord = { tiles: new Map(this.before) };
    this.before.clear();
    this.buffers.clear();
    this.colours.clear();
    this.carry = null;
    return record;
  }

  private lay(specs: DabSpec[]): number[] {
    const touched = new Set<number>();
    for (const spec of specs) {
      const dab = makeDab(
        this.brush.tip.source,
        this.assets,
        spec.x,
        spec.y,
        spec.size,
        spec.angle,
        spec.roundness,
        this.brush.tip.flipX,
        this.brush.tip.flipY,
      );
      if (!dab) continue;
      if (this.buffered) this.stamp(spec, dab, touched);
      else this.deposit(spec, dab, touched);
    }
    return this.buffered ? this.recompose(touched) : this.settle(touched);
  }

  /** The tile's pixels as they were before this stroke, kept the first time the stroke reaches it. */
  private snapshot(key: number): void {
    if (this.before.has(key)) return;
    const tile = this.layer.tile(key);
    this.before.set(key, tile ? tile.slice() : null);
  }

  /** How much paint the grain's hollows take from this pixel (0 where there is no grain). */
  private grainHollow(spec: DabSpec, px: number, py: number): number {
    const grain = this.brush.grain;
    const img = this.grain;
    if (!grain || !img) return 0;
    // Paper grain is fixed to the canvas; moving grain is measured from the dab's centre.
    const gx = Math.floor((grain.mode === "paper" ? px : px - spec.x) * grain.scale);
    const gy = Math.floor((grain.mode === "paper" ? py : py - spec.y) * grain.scale);
    const ix = ((gx % img.width) + img.width) % img.width;
    const iy = ((gy % img.height) + img.height) % img.height;
    const h = (img.value[iy * img.width + ix] ?? 255) / 255;
    return (1 - h) * this.grainDepth;
  }

  /** Paint and erase: one dab adds `a * flow` to the stroke buffer, so overlaps build up but never pass 1. */
  private stamp(spec: DabSpec, dab: TipDab, touched: Set<number>): void {
    const { layer } = this;
    const T = layer.tileSize;
    const grain = this.brush.grain;
    // Per-dab opacity variation is applied as flow, so the cap stays a single stroke-wide ceiling.
    const flow = this.baseFlow * spec.flow * spec.opacity;
    const tint = this.brush.colour ? (spec.colour ?? this.colour) : null;
    const margin = this.brush.wetEdges ? WET_RADIUS : 0;
    for (const key of layer.tilesInRect(dab.minX, dab.minY, dab.maxX - dab.minX, dab.maxY - dab.minY)) {
      this.snapshot(key);
      let buf = this.buffers.get(key);
      if (!buf) {
        buf = new Float32Array(T * T);
        this.buffers.set(key, buf);
      }
      let col = this.colours.get(key);
      if (tint && !col) {
        col = new Float32Array(T * T * 3);
        this.colours.set(key, col);
      }
      const rect = layer.tileRect(key);
      const x1 = Math.min(dab.maxX, rect.x + rect.w);
      const y1 = Math.min(dab.maxY, rect.y + rect.h);
      for (let py = Math.max(dab.minY, rect.y); py < y1; py++) {
        for (let px = Math.max(dab.minX, rect.x); px < x1; px++) {
          let a = dab.cover(px, py);
          if (a <= 0) continue;
          if (grain && this.grain) a = Math.max(0, a - this.grainHollow(spec, px, py));
          a *= flow;
          if (a <= 0) continue;
          const i = (py - rect.y) * T + (px - rect.x);
          const b = buf[i] ?? 0;
          const nb = b + a * (1 - b);
          buf[i] = nb;
          if (tint && col) {
            const w = (a * (1 - b)) / nb;
            const c = i * 3;
            col[c] = (col[c] ?? 0) + (tint.r - (col[c] ?? 0)) * w;
            col[c + 1] = (col[c + 1] ?? 0) + (tint.g - (col[c + 1] ?? 0)) * w;
            col[c + 2] = (col[c + 2] ?? 0) + (tint.b - (col[c + 2] ?? 0)) * w;
          }
        }
      }
      touched.add(key);
    }
    if (margin > 0) {
      for (const key of layer.tilesInRect(dab.minX - margin, dab.minY - margin, dab.maxX - dab.minX + 2 * margin, dab.maxY - dab.minY + 2 * margin)) {
        if (this.buffers.has(key)) touched.add(key);
      }
    }
  }

  /** Rebuilds every touched tile from its `before` copy plus the buffer, so the opacity cap holds. */
  private recompose(touched: Set<number>): number[] {
    const { layer, brush } = this;
    const T = layer.tileSize;
    const blend = this.mode === "erase" ? "clear" : brush.blend;
    const keys: number[] = [];
    for (const key of touched) {
      const buf = this.buffers.get(key);
      if (!buf) continue;
      const before = this.before.get(key);
      const out = before ? before.slice() : new Uint8ClampedArray(T * T * 4);
      const shaped = brush.wetEdges ? this.wetEdges(key) : buf;
      const col = this.colours.get(key);
      for (let i = 0; i < T * T; i++) {
        const c = shaped[i] ?? 0;
        if (c <= 0.004) continue;
        const o = i * 4;
        if (col) blendPixel(out, o, blend, col[i * 3] ?? 0, col[i * 3 + 1] ?? 0, col[i * 3 + 2] ?? 0, c * this.cap);
        else blendPixel(out, o, blend, this.colour.r, this.colour.g, this.colour.b, c * this.cap);
      }
      layer.setTile(key, layer.isTileEmpty(out) ? null : out);
      keys.push(key);
    }
    return keys;
  }

  /**
   * Paint pools at the rim of the finished stroke: the buffer minus its own blur, read across tile
   * seams. Done on the stroke, never in the tip, or a soft stamp train shows as a chain of rings.
   */
  private wetEdges(key: number): Float32Array {
    const { layer } = this;
    const T = layer.tileSize;
    const r = WET_RADIUS;
    const P = T + 2 * r;
    const buf = this.buffers.get(key) ?? new Float32Array(T * T);
    const tx = key % layer.cols;
    const ty = Math.floor(key / layer.cols);
    const pad = new Float32Array(P * P);
    for (let ny = -1; ny <= 1; ny++) {
      for (let nx = -1; nx <= 1; nx++) {
        if (tx + nx < 0 || ty + ny < 0 || tx + nx >= layer.cols || ty + ny >= layer.rows) continue;
        const nb = nx === 0 && ny === 0 ? buf : this.buffers.get(layer.key(tx + nx, ty + ny));
        if (!nb) continue;
        // Copy the strip of that neighbour that falls inside the padded window.
        const sx0 = nx < 0 ? T - r : 0;
        const sx1 = nx > 0 ? r : T;
        const sy0 = ny < 0 ? T - r : 0;
        const sy1 = ny > 0 ? r : T;
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            pad[(sy + r + ny * T) * P + sx + r + nx * T] = nb[sy * T + sx] ?? 0;
          }
        }
      }
    }
    // Separable box blur: rows over the full padded height, then columns.
    const width = 2 * r + 1;
    const rowBlur = new Float32Array(T * P);
    for (let y = 0; y < P; y++) {
      let sum = 0;
      for (let x = 0; x < width; x++) sum += pad[y * P + x] ?? 0;
      for (let x = 0; x < T; x++) {
        rowBlur[y * T + x] = sum / width;
        sum += (pad[y * P + x + width] ?? 0) - (pad[y * P + x] ?? 0);
      }
    }
    const out = new Float32Array(T * T);
    for (let x = 0; x < T; x++) {
      let sum = 0;
      for (let y = 0; y < width; y++) sum += rowBlur[y * T + x] ?? 0;
      for (let y = 0; y < T; y++) {
        const b = buf[y * T + x] ?? 0;
        if (b > 0.01) {
          const edge = Math.min(1, Math.max(0, (b - sum / width) * WET_GAIN));
          out[y * T + x] = Math.min(1, b * 0.55 + edge * 0.6);
        }
        sum += (rowBlur[(y + width) * T + x] ?? 0) - (rowBlur[y * T + x] ?? 0);
      }
    }
    return out;
  }

  /** Smudge and wet paint: pick up what is under the dab, blend it into what is carried, lay it down. */
  private deposit(spec: DabSpec, dab: TipDab, touched: Set<number>): void {
    const { layer, brush } = this;
    const T = layer.tileSize;
    const wet = brush.wetMix;
    const pull = wet?.pull ?? 0.2;
    const sampled = layer.averageColour(spec.x, spec.y, Math.max(1, spec.size * 0.3));
    if (!this.carry) {
      if (this.mode === "paint") {
        const w = wet?.charge ?? 1;
        const own = this.colour;
        this.carry = sampled
          ? { r: sampled.r + (own.r - sampled.r) * w, g: sampled.g + (own.g - sampled.g) * w, b: sampled.b + (own.b - sampled.b) * w, a: 1 }
          : { r: own.r, g: own.g, b: own.b, a: 1 };
      } else {
        this.carry = sampled ? { ...sampled } : { r: 0, g: 0, b: 0, a: 0 };
      }
    } else if (sampled) {
      const c = this.carry;
      if (this.mode === "smudge" && c.a < 0.01) {
        c.r = sampled.r;
        c.g = sampled.g;
        c.b = sampled.b;
      } else {
        const m = pull * Math.min(1, sampled.a * 2);
        c.r += (sampled.r - c.r) * m;
        c.g += (sampled.g - c.g) * m;
        c.b += (sampled.b - c.b) * m;
      }
      if (this.mode === "smudge") c.a += (sampled.a - c.a) * pull;
    } else if (this.mode === "smudge") {
      this.carry.a *= 1 - pull;
    }
    const carry = this.carry;
    const strength = this.baseFlow * spec.flow * spec.opacity * carry.a * (1 - (wet?.dilution ?? 0));
    if (strength <= 0.001) return;
    for (const key of layer.tilesInRect(dab.minX, dab.minY, dab.maxX - dab.minX, dab.maxY - dab.minY)) {
      this.snapshot(key);
      const tile = layer.ensureTile(key);
      const rect = layer.tileRect(key);
      const x1 = Math.min(dab.maxX, rect.x + rect.w);
      const y1 = Math.min(dab.maxY, rect.y + rect.h);
      for (let py = Math.max(dab.minY, rect.y); py < y1; py++) {
        for (let px = Math.max(dab.minX, rect.x); px < x1; px++) {
          const a = dab.cover(px, py);
          if (a <= 0) continue;
          const cov = Math.max(0, a - (brush.grain && this.grain ? this.grainHollow(spec, px, py) : 0)) * strength;
          if (cov <= 0.002) continue;
          blendPixel(tile, ((py - rect.y) * T + (px - rect.x)) * 4, "normal", carry.r, carry.g, carry.b, cov);
        }
      }
      touched.add(key);
    }
  }

  /** Drops tiles that ended up empty and reports the changed keys. */
  private settle(touched: Set<number>): number[] {
    const keys: number[] = [];
    for (const key of touched) {
      const tile = this.layer.tile(key);
      if (tile && this.layer.isTileEmpty(tile)) this.layer.setTile(key, null);
      keys.push(key);
    }
    return keys;
  }
}

export function beginStroke(layer: TiledLayer, options: StrokeOptions, assets: PaintAssets): Stroke {
  return new PaintStroke(layer, options, assets);
}
