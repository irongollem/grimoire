import { describe, expect, it } from "vitest";
import type { BrushPreset, PaintAssets } from "../engine/types";
import { previewSamples, renderBrushPreview, renderTipPreview } from "./brushPreview";

const V = { jitter: 0, control: "off", minimum: 0 } as const;
const INK = { r: 20, g: 20, b: 20 };
const none: PaintAssets = { tip: () => undefined, grain: () => undefined };

function brush(hardness: number, patch: Partial<BrushPreset> = {}): BrushPreset {
  return {
    v: 1, id: "t", name: "t", group: "basic",
    tip: { source: { kind: "round", hardness }, size: 24, angle: 0, roundness: 1, spacing: 0.1, flipX: false, flipY: false, followDirection: false },
    shape: null, scatter: null, grain: null, transfer: { flow: 1, opacity: 1, flowDynamics: V, opacityDynamics: V },
    wetEdges: false, wetMix: null, colour: null, smoothing: 0, blend: "normal", fadeLength: 0,
    ...patch,
  };
}

const alphaAt = (p: { width: number; data: Uint8ClampedArray }, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3] ?? 0;
const opts = { width: 160, height: 48, colour: INK };

describe("renderTipPreview", () => {
  // Fails if a single-sample stroke lays nothing (the library's tip square would be blank).
  it("a hard round tip is opaque at its centre and empty at the corner", () => {
    const p = renderTipPreview(brush(1), none, { width: 40, height: 40, colour: INK });
    expect(alphaAt(p, 20, 20)).toBe(255);
    expect(alphaAt(p, 0, 0)).toBe(0);
  });
});

describe("renderBrushPreview", () => {
  // Fails if the S-curve ignores pressure: ends at pressure 0.2 must be thinner than the middle.
  it("the stroke swells in the middle and thins at the ends", () => {
    const samples = previewSamples(160, 48, 12);
    const first = samples[0]!;
    const mid = samples[Math.floor(samples.length / 2)]!;
    expect(mid.pressure).toBeCloseTo(1, 1);
    expect(first.pressure).toBeCloseTo(0.2, 5);
    expect(samples.at(-1)!.pressure).toBeCloseTo(0.2, 5);
  });

  // Fails if a soft brush paints hard-edged: a soft tip's edge has partial alpha, a hard one only 0 or 255.
  it("a soft brush has partial alpha where a hard one does not", () => {
    const partial = (b: BrushPreset) => {
      const p = renderBrushPreview(b, none, opts);
      let n = 0;
      for (let i = 3; i < p.data.length; i += 4) if (p.data[i]! > 10 && p.data[i]! < 245) n++;
      return n;
    };
    expect(partial(brush(0))).toBeGreaterThan(partial(brush(1)) * 2);
    expect(partial(brush(0))).toBeGreaterThan(50);
  });

  // Fails if the stroke is not clipped to the box (output length would not match width x height).
  it("returns exactly width x height pixels, with paint in them", () => {
    const p = renderBrushPreview(brush(1), none, opts);
    expect(p.data.length).toBe(160 * 48 * 4);
    expect(p.data.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
  });

  // Fails if the cache key ignores a setting: a changed brush would come back as the old picture.
  it("remembers a brush's preview and repaints when any setting changes", () => {
    const a = renderBrushPreview(brush(0.5), none, opts);
    expect(renderBrushPreview(brush(0.5), none, opts)).toBe(a);
    const thinner = brush(0.5);
    thinner.tip.size = 8;
    expect(renderBrushPreview(thinner, none, opts)).not.toBe(a);
    expect(renderBrushPreview(brush(0.5, { smoothing: 0.4 }), none, opts)).not.toBe(a);
    expect(renderBrushPreview(brush(0.5), none, { ...opts, colour: { r: 1, g: 2, b: 3 } })).not.toBe(a);
    expect(renderBrushPreview(brush(0.5), none, { ...opts, spacingOverride: 3 })).not.toBe(a);
  });

  // Fails if a rename repaints: the key must ignore id/name, which change nothing on the canvas.
  it("a rename does not repaint", () => {
    const a = renderBrushPreview(brush(0.5), none, opts);
    expect(renderBrushPreview({ ...brush(0.5), name: "Other" }, none, opts)).toBe(a);
  });

  // Fails if a not-yet-loaded image tip is cached: the blank result would stick after the tip arrives.
  it("does not keep a preview whose image tip has not loaded", () => {
    const b = brush(1, { tip: { ...brush(1).tip, source: { kind: "image", id: "sponge" } } });
    const early = renderBrushPreview(b, none, opts);
    expect(early.data.every((v) => v === 0)).toBe(true);
    const loaded: PaintAssets = { tip: () => ({ width: 2, height: 2, alpha: new Uint8Array([255, 255, 255, 255]) }), grain: () => undefined };
    const later = renderBrushPreview(b, loaded, opts);
    expect(later).not.toBe(early);
    expect(later.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
  });

  // Fails if spacingOverride is ignored: wide spacing leaves gaps, so less is painted than at the brush's own.
  it("a wide spacing leaves dabs apart", () => {
    const sum = (p: { data: Uint8ClampedArray }) => p.data.reduce((a, v, i) => (i % 4 === 3 ? a + v : a), 0);
    const apart = renderBrushPreview(brush(1), none, { ...opts, spacingOverride: 2.5 });
    const melted = renderBrushPreview(brush(1), none, opts);
    expect(sum(apart)).toBeLessThan(sum(melted) * 0.6);
  });
});
