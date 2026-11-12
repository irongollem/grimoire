import { describe, expect, it } from "vitest";
import { PaintHistory } from "./history";
import { DEFAULT_PRESSURE_CURVE } from "./pressure";
import { type StrokeOptions, beginStroke } from "./stroke";
import { TiledLayer } from "./tiledLayer";
import type { BrushPreset, GrainImage, PaintAssets, PenSample, StrokeMode } from "./types";

const V = { jitter: 0, control: "off", minimum: 0 } as const;
const RED = { r: 200, g: 30, b: 30 };

function brush(patch: Partial<BrushPreset> = {}, size = 20): BrushPreset {
  return {
    v: 1, id: "t", name: "t", group: "dry",
    tip: { source: { kind: "round", hardness: 1 }, size, angle: 0, roundness: 1, spacing: 0.1, flipX: false, flipY: false, followDirection: false },
    shape: null, scatter: null, grain: null, transfer: { flow: 1, opacity: 1, flowDynamics: V, opacityDynamics: V },
    wetEdges: false, wetMix: null, colour: null, smoothing: 0, blend: "normal", fadeLength: 0,
    ...patch,
  };
}

const sample = (x: number, y: number): PenSample => ({ x, y, pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0, time: 0, pointer: "pen" });
const line = (x0: number, x1: number, y = 40, step = 8) => {
  const out: PenSample[] = [];
  for (let x = x0; x <= x1; x += step) out.push(sample(x, y));
  return out;
};

// A checker grain: odd columns are hollow (0), even are peaks (255).
const stripes: GrainImage = { width: 2, height: 1, value: new Uint8Array([255, 0]) };
const assets: PaintAssets = { tip: () => undefined, grain: (id) => (id === "stripes" ? stripes : undefined) };

function paint(layer: TiledLayer, b: BrushPreset, samples: PenSample[], extra: Partial<StrokeOptions> = {}, mode: StrokeMode = "paint", seed = 1) {
  const s = beginStroke(layer, { brush: b, colour: RED, mode, seed, curve: DEFAULT_PRESSURE_CURVE, ...extra }, assets);
  s.add(samples);
  return s.end();
}

function alphaAt(layer: TiledLayer, x: number, y: number): number {
  const t = layer.tile(layer.key(Math.floor(x / layer.tileSize), Math.floor(y / layer.tileSize)));
  if (!t) return 0;
  return t[((y % layer.tileSize) * layer.tileSize + (x % layer.tileSize)) * 4 + 3] ?? 0;
}
const snapshot = (layer: TiledLayer) => layer.keys().sort((a, b) => a - b).map((k) => [k, Array.from(layer.tile(k) ?? [])]);

describe("paint strokes", () => {
  // Fails if dabs overwrite instead of building: with flow 0.2 a single pass is faint, many overlapping dabs deepen it.
  it("flow builds up with overlapping dabs", () => {
    const light = new TiledLayer(120, 80, 64);
    paint(light, brush({ tip: { ...brush().tip, spacing: 2 } }), line(10, 100), { overrides: { flow: 0.2 } });
    const dense = new TiledLayer(120, 80, 64);
    paint(dense, brush({ tip: { ...brush().tip, spacing: 0.05 } }), line(10, 100), { overrides: { flow: 0.2 } });
    // Light dabs sit 40 px apart, so (50, 40) holds exactly one of them.
    expect(alphaAt(light, 50, 40)).toBeGreaterThan(40);
    expect(alphaAt(dense, 50, 40)).toBeGreaterThan(alphaAt(light, 50, 40) + 100);
  });

  // Fails if each add() composes onto the live tile instead of the pre-stroke copy: the cap would compound per call.
  it("the opacity cap holds across many add calls", () => {
    const layer = new TiledLayer(120, 80, 64);
    const s = beginStroke(layer, { brush: brush(), colour: RED, mode: "paint", seed: 1, curve: DEFAULT_PRESSURE_CURVE, overrides: { opacity: 0.4 } }, assets);
    for (const x of [10, 30, 50, 70, 90]) s.add(line(x, x + 20));
    s.add(line(90, 10));
    s.end();
    expect(alphaAt(layer, 50, 40)).toBeLessThanOrEqual(Math.round(0.4 * 255));
    expect(alphaAt(layer, 50, 40)).toBeGreaterThan(0.38 * 255);
  });

  // Fails if the brush's own flow and opacity are ignored (stock brushes' values were being dropped) or the override does not replace them.
  it("uses the brush's own flow and opacity, and an override replaces them", () => {
    const b = brush({ transfer: { flow: 1, opacity: 0.5, flowDynamics: V, opacityDynamics: V } });
    const own = new TiledLayer(120, 80, 64);
    paint(own, b, line(10, 100));
    expect(alphaAt(own, 60, 40)).toBe(Math.round(0.5 * 255));
    const over = new TiledLayer(120, 80, 64);
    paint(over, b, line(10, 100), { overrides: { opacity: 1 } });
    expect(alphaAt(over, 60, 40)).toBe(255);
    const lowFlow = new TiledLayer(120, 80, 64);
    paint(lowFlow, brush({ transfer: { flow: 0.05, opacity: 1, flowDynamics: V, opacityDynamics: V }, tip: { ...brush().tip, spacing: 2 } }), line(10, 100));
    expect(alphaAt(lowFlow, 50, 40)).toBeLessThan(30);
    const flowOver = new TiledLayer(120, 80, 64);
    paint(flowOver, brush({ transfer: { flow: 0.05, opacity: 1, flowDynamics: V, opacityDynamics: V }, tip: { ...brush().tip, spacing: 2 } }), line(10, 100), { overrides: { flow: 1 } });
    expect(alphaAt(flowOver, 50, 40)).toBe(255);
  });

  // Fails if the opacity cap is applied per dab instead of to the stroke: overlap would exceed the cap.
  it("coverage never exceeds the stroke opacity however many dabs overlap", () => {
    const layer = new TiledLayer(120, 80, 64);
    paint(layer, brush({ tip: { ...brush().tip, spacing: 0.02 } }), [...line(10, 100), ...line(100, 10), ...line(10, 100)], { overrides: { opacity: 0.4 } });
    let max = 0;
    for (let x = 0; x < 120; x++) for (let y = 0; y < 80; y++) max = Math.max(max, alphaAt(layer, x, y));
    expect(max).toBeLessThanOrEqual(Math.round(0.4 * 255));
    expect(max).toBeGreaterThan(0.38 * 255);
  });

  // Fails if the colour is wrong or a stroke paints outside the dab: red where inked, nothing far away.
  it("paints the stroke colour only under the stroke", () => {
    const layer = new TiledLayer(120, 80, 64);
    paint(layer, brush(), line(10, 100));
    const t = layer.tile(0);
    const o = (40 * 64 + 30) * 4;
    expect([t?.[o], t?.[o + 1], t?.[o + 2], t?.[o + 3]]).toEqual([200, 30, 30, 255]);
    expect(alphaAt(layer, 60, 5)).toBe(0);
  });

  // Fails if erase paints, or does not lower alpha by coverage.
  it("erase lowers alpha", () => {
    const layer = new TiledLayer(120, 80, 64);
    paint(layer, brush(), line(10, 100));
    paint(layer, brush(), line(10, 100), { overrides: { opacity: 0.5 } }, "erase");
    expect(alphaAt(layer, 60, 40)).toBeGreaterThan(110);
    expect(alphaAt(layer, 60, 40)).toBeLessThan(145);
  });

  // Fails if a tile erased to nothing stays allocated.
  it("an erased-to-transparent tile is deleted from the layer", () => {
    const layer = new TiledLayer(64, 64, 64);
    paint(layer, brush({}, 30), [sample(32, 32), sample(34, 32)]);
    expect(layer.keys()).toEqual([0]);
    paint(layer, brush({}, 200), [sample(32, 32), sample(34, 32)], {}, "erase");
    expect(layer.keys()).toEqual([]);
  });

  // Fails if behind ignores the existing paint and covers it.
  it("a behind stroke leaves existing paint and fills the gaps", () => {
    const layer = new TiledLayer(120, 80, 64);
    paint(layer, brush(), line(10, 50));
    paint(layer, brush({ blend: "behind" }), line(10, 100), { colour: { r: 0, g: 0, b: 255 } });
    const t = layer.tile(0);
    const o = (40 * 64 + 30) * 4;
    expect([t?.[o], t?.[o + 2]]).toEqual([200, 30]);
    const t2 = layer.tile(layer.key(1, 0));
    expect(t2?.[(40 * 64 + 20) * 4 + 2]).toBe(255);
  });

  // Fails if a stroke across a tile seam leaves a visible gap or a doubled line at the seam.
  it("a stroke is continuous across tile seams", () => {
    const layer = new TiledLayer(128, 64, 64);
    paint(layer, brush(), line(10, 110, 30));
    for (let x = 58; x < 70; x++) expect(alphaAt(layer, x, 30)).toBe(255);
  });

  describe("grain", () => {
    const grained = (mode: "paper" | "moving") => brush({ grain: { id: "stripes", scale: 1, depth: 1, mode } });
    // Fails if paper grain follows the dab: the same canvas pixel must see the same grain from different dabs.
    it("paper grain is fixed to the canvas", () => {
      const a = new TiledLayer(64, 64, 64);
      const b = new TiledLayer(64, 64, 64);
      paint(a, grained("paper"), [sample(20, 32), sample(21, 32)]);
      paint(b, grained("paper"), [sample(23, 32), sample(24, 32)]);
      // Column 24 is hollow (even x peaks), 25 is a peak... check two shared pixels agree on hollow vs peak.
      for (const x of [22, 23, 24, 25]) expect(alphaAt(a, x, 32) > 0).toBe(alphaAt(b, x, 32) > 0);
      expect(alphaAt(a, 22, 32)).toBeGreaterThan(0);
      expect(alphaAt(a, 23, 32)).toBe(0);
    });
    // Fails if moving grain is fixed to the canvas: shifting the dab by an odd amount must shift the pattern.
    it("moving grain travels with the dab", () => {
      const a = new TiledLayer(64, 64, 64);
      const b = new TiledLayer(64, 64, 64);
      paint(a, grained("moving"), [sample(20.5, 32), sample(20.6, 32)]);
      paint(b, grained("moving"), [sample(21.5, 32), sample(21.6, 32)]);
      expect(alphaAt(a, 22, 32) > 0).not.toBe(alphaAt(b, 22, 32) > 0);
    });
  });

  describe("paper", () => {
    const solid: GrainImage = { width: 2, height: 1, value: new Uint8Array([255, 255]) };
    const as2: PaintAssets = { tip: () => undefined, grain: (id) => (id === "stripes" ? stripes : id === "solid" ? solid : undefined) };
    const own = brush({ grain: { id: "stripes", scale: 1, depth: 1, mode: "paper" } });
    const on = (b: BrushPreset, paper: { grainId: string; tooth: number } | undefined) => {
      const l = new TiledLayer(64, 64, 64);
      const st = beginStroke(l, { brush: b, colour: RED, mode: "paint", seed: 1, curve: DEFAULT_PRESSURE_CURVE, paper: paper && { id: "p", name: "p", surfacePath: "", surfaceScale: 1, ...paper } }, as2);
      st.add([sample(20, 32), sample(40, 32)]);
      st.end();
      return l;
    };
    // Fails if the paper's grain is ignored and the brush's own is used: a solid paper has no hollows to take paint.
    it("a paper-mode grain samples the paper's grain, not the brush's", () => {
      expect(alphaAt(on(own, undefined), 23, 32)).toBe(0);
      expect(alphaAt(on(own, { grainId: "solid", tooth: 1 }), 23, 32)).toBe(255);
    });
    // Fails if tooth does not scale depth: smoother paper must take away less paint.
    it("a smoother paper takes less paint away", () => {
      expect(alphaAt(on(own, { grainId: "stripes", tooth: 1 }), 23, 32)).toBe(0);
      // One dab only (wide spacing): overlapping dabs would build the lost paint back up.
      const single = brush({ grain: { id: "stripes", scale: 1, depth: 1, mode: "paper" }, tip: { ...brush().tip, spacing: 5 } });
      const smooth = alphaAt(on(single, { grainId: "stripes", tooth: 0.4 }), 23, 32);
      expect(smooth).toBeGreaterThan(100);
      expect(smooth).toBeLessThan(255);
    });
    // Fails if a moving grain is switched to the paper's.
    it("moving grain ignores the paper", () => {
      const mv = brush({ grain: { id: "stripes", scale: 1, depth: 1, mode: "moving" } });
      expect(snapshot(on(mv, { grainId: "solid", tooth: 0 }))).toEqual(snapshot(on(mv, undefined)));
    });
  });

  // Fails if wet edges are skipped or applied to the tile instead of the stroke: the rim must be stronger than the middle,
  // and the same stroke must look the same on two tile layouts (no seam artefacts).
  it("wet edges pool at the rim and read across tile seams", () => {
    const wet = brush({ wetEdges: true }, 40);
    const a = new TiledLayer(128, 128, 32);
    paint(a, wet, line(20, 100, 60), { overrides: { flow: 0.5 } });
    const rim = alphaAt(a, 60, 60 - 19);
    const mid = alphaAt(a, 60, 60);
    expect(rim).toBeGreaterThan(mid);
    const b = new TiledLayer(128, 128, 128);
    paint(b, wet, line(20, 100, 60), { overrides: { flow: 0.5 } });
    for (let x = 28; x < 100; x += 3) for (let y = 36; y < 85; y += 3) expect(alphaAt(a, x, y)).toBe(alphaAt(b, x, y));
  });

  // Fails if the stroke is not reproducible from samples and seed (jitter drawn outside the seeded rng).
  it("the same samples and seed give byte-identical layers", () => {
    const b = brush({ shape: { size: { jitter: 0.6, control: "off", minimum: 0.2 }, angle: { jitter: 1, control: "off", minimum: 0 }, roundness: V }, scatter: { amount: 0.5, bothAxes: true, count: 2, countJitter: 0.5 }, wetEdges: true });
    const run = (seed: number) => {
      const l = new TiledLayer(128, 80, 64);
      paint(l, b, line(10, 110), {}, "paint", seed);
      return snapshot(l);
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  // Fails if the changed-tiles list misses a tile the stroke touched, so the renderer shows stale pixels.
  it("add reports the tiles it changed", () => {
    const layer = new TiledLayer(128, 64, 64);
    const s = beginStroke(layer, { brush: brush(), colour: RED, mode: "paint", seed: 1, curve: DEFAULT_PRESSURE_CURVE }, assets);
    expect(s.add(line(10, 40, 30)).sort()).toEqual([0]);
    expect(s.add(line(40, 100, 30)).sort()).toEqual([0, 1]);
  });
});

describe("undo", () => {
  // Fails if end() does not keep pre-stroke tiles: undo restores the exact pixels, redo reapplies exactly.
  it("undo restores pre-stroke pixels (deleting created tiles) and redo reapplies", () => {
    const layer = new TiledLayer(192, 64, 64);
    const history = new PaintHistory();
    history.push(layer, paint(layer, brush(), line(10, 60, 30)));
    const first = snapshot(layer);
    history.push(layer, paint(layer, brush({ wetEdges: true }), line(30, 180, 40), { overrides: { opacity: 0.7 } }));
    const second = snapshot(layer);
    expect(layer.keys().length).toBe(3);
    history.undo(layer);
    expect(snapshot(layer)).toEqual(first);
    history.redo(layer);
    expect(snapshot(layer)).toEqual(second);
    history.undo(layer);
    history.undo(layer);
    expect(layer.keys()).toEqual([]);
  });

  // Fails if the before copy aliases the live tile, so later dabs rewrite the undo data.
  it("the undo record is a copy, not the live tile", () => {
    const layer = new TiledLayer(64, 64, 64);
    paint(layer, brush(), [sample(20, 20), sample(30, 20)]);
    const rec = paint(layer, brush(), [sample(40, 40), sample(50, 40)]);
    expect(rec.tiles.get(0)).not.toBe(layer.tile(0));
  });
});

describe("smudge and wet mix", () => {
  const vertical = (x: number, y0: number, y1: number) => {
    const out: PenSample[] = [];
    for (let y = y0; y <= y1; y += 4) out.push(sample(x, y));
    return out;
  };

  // Fails if smudge only paints with the brush colour (it must drag what is underneath) or lays nothing.
  it("smudge drags paint from under the pen into clean canvas", () => {
    const layer = new TiledLayer(128, 128, 64);
    paint(layer, brush({}, 40), [sample(30, 30), sample(32, 30)]);
    expect(alphaAt(layer, 80, 30)).toBe(0);
    paint(layer, brush({ wetMix: { dilution: 0, charge: 0, pull: 0.1 } }, 30), line(30, 90, 30, 4), {}, "smudge");
    expect(alphaAt(layer, 70, 30)).toBeGreaterThan(0);
    const t = layer.tile(layer.key(1, 0));
    const o = (30 * 64 + 6) * 4;
    expect(t?.[o]).toBeGreaterThan(150);
  });

  // Fails if smudge has the opacity cap or paints on empty canvas: smudging nothing must stay nothing.
  it("smudge over empty canvas lays nothing", () => {
    const layer = new TiledLayer(128, 128, 64);
    paint(layer, brush({}, 30), line(10, 100, 60, 4), {}, "smudge");
    expect(layer.keys()).toEqual([]);
  });

  // Fails if wet paint is not diluted by dilution, or never picks up underlying colour.
  it("wet paint picks up the colour beneath and dilution thins it", () => {
    const base = new TiledLayer(128, 128, 64);
    paint(base, brush({}, 60), [sample(60, 60), sample(62, 60)], { colour: { r: 0, g: 0, b: 255 } });
    const wet = (dilution: number) => {
      const l = new TiledLayer(128, 128, 64);
      for (const k of base.keys()) l.setTile(k, base.tile(k)?.slice() ?? null);
      paint(l, brush({ wetMix: { dilution, charge: 0.5, pull: 0.6 } }, 30), vertical(60, 20, 100), { overrides: { flow: 0.4 } });
      return l;
    };
    const plain = wet(0);
    const thin = wet(0.8);
    const px = (l: TiledLayer, x: number, y: number) => l.tile(l.key(Math.floor(x / 64), Math.floor(y / 64)))?.slice((y % 64 * 64 + x % 64) * 4, (y % 64 * 64 + x % 64) * 4 + 4);
    expect(px(plain, 60, 90)?.[3]).toBeGreaterThan(px(thin, 60, 90)?.[3] ?? 0);
    // Blue has been carried into the red stroke's colour.
    expect(px(plain, 60, 80)?.[2]).toBeGreaterThan(30);
  });

  // Fails if smudge writes no undo data.
  it("smudge can be undone", () => {
    const layer = new TiledLayer(128, 128, 64);
    paint(layer, brush({}, 40), [sample(30, 30), sample(32, 30)]);
    const before = snapshot(layer);
    const h = new PaintHistory();
    h.push(layer, paint(layer, brush({}, 30), line(30, 90, 30, 4), {}, "smudge"));
    expect(snapshot(layer)).not.toEqual(before);
    h.undo(layer);
    expect(snapshot(layer)).toEqual(before);
  });
});

describe("lock alpha", () => {
  const px = (l: TiledLayer, x: number, y: number) => {
    const t = l.tile(l.key(Math.floor(x / 64), Math.floor(y / 64)));
    const o = ((y % 64) * 64 + (x % 64)) * 4;
    return t ? Array.from(t.slice(o, o + 4)) : [0, 0, 0, 0];
  };
  const base = () => {
    const l = new TiledLayer(128, 128, 64);
    // A half-covered blue patch on the left; the rest stays transparent.
    paint(l, brush({}, 30), [sample(30, 40), sample(32, 40)], { colour: { r: 0, g: 0, b: 255 }, overrides: { opacity: 0.5 } });
    return l;
  };

  // Fails if a locked stroke paints on transparent pixels (it must only recolour existing paint).
  it("leaves transparent pixels transparent, for buffered and wet strokes", () => {
    for (const b of [brush({}, 30), brush({ wetMix: { dilution: 0, charge: 1, pull: 0.5 } }, 30)]) {
      const l = base();
      paint(l, b, line(70, 110, 40, 4), { lockAlpha: true });
      expect(px(l, 90, 40)[3]).toBe(0);
    }
  });

  // Fails if a locked stroke raises or lowers coverage where there is paint: alpha must stay, colour must change.
  it("keeps alpha on painted pixels and still recolours them", () => {
    for (const b of [brush({}, 30), brush({ wetMix: { dilution: 0, charge: 1, pull: 0 } }, 30)]) {
      const l = base();
      const was = px(l, 31, 40);
      paint(l, b, line(20, 44, 40, 2), { lockAlpha: true });
      const now = px(l, 31, 40);
      expect(now[3]).toBe(was[3]);
      expect(now[0]).toBeGreaterThan(was[0] ?? 0);
    }
  });

  // Fails if an erase stroke on a locked layer still lowers alpha.
  it("an erase stroke cannot lower alpha", () => {
    const l = base();
    const was = px(l, 31, 40)[3];
    paint(l, brush({}, 30), line(20, 44, 40, 2), { lockAlpha: true }, "erase");
    expect(px(l, 31, 40)[3]).toBe(was);
  });
});

