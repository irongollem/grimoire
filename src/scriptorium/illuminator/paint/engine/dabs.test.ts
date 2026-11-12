import { describe, expect, it } from "vitest";
import { DabGenerator } from "./dabs";
import { DEFAULT_PRESSURE_CURVE } from "./pressure";
import { createRng } from "./rng";
import type { BrushPreset, PenSample } from "./types";

const V = { jitter: 0, control: "off", minimum: 0 } as const;

function testBrush(patch: Partial<BrushPreset> = {}): BrushPreset {
  return {
    v: 1,
    id: "t",
    name: "t",
    group: "dry",
    tip: { source: { kind: "round", hardness: 1 }, size: 20, angle: 0, roundness: 1, spacing: 0.25, flipX: false, flipY: false, followDirection: false },
    shape: null,
    scatter: null,
    grain: null,
    transfer: { flow: 1, opacity: 1, flowDynamics: V, opacityDynamics: V },
    wetEdges: false,
    wetMix: null,
    colour: null,
    smoothing: 0,
    blend: "normal",
    fadeLength: 0,
    ...patch,
  };
}

const sample = (x: number, y: number, extra: Partial<PenSample> = {}): PenSample => ({
  x, y, pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0, time: 0, pointer: "pen", ...extra,
});
const line = (x0: number, x1: number, step = 10, extra: Partial<PenSample> = {}) => {
  const out: PenSample[] = [];
  for (let x = x0; x <= x1; x += step) out.push(sample(x, 50, extra));
  return out;
};
const gen = (brush: BrushPreset, seed = 1) =>
  new DabGenerator({ brush, colour: { r: 200, g: 40, b: 40 }, curve: DEFAULT_PRESSURE_CURVE, rng: createRng(seed) });

describe("DabGenerator spacing", () => {
  // Fails if spacing ignores size or dabs are laid per sample instead of per arc length: 100 px at 5 px = 21 dabs.
  it("lays one dab per spacing * size along a straight stroke", () => {
    const dabs = gen(testBrush()).add(line(0, 100));
    expect(Math.abs(dabs.length - 21)).toBeLessThanOrEqual(1);
    expect(dabs[0]?.x).toBeCloseTo(0, 1);
    expect(dabs[1]?.x).toBeCloseTo(5, 0);
  });

  // Fails if the leftover distance resets each add(): two halves would lay more dabs than the whole.
  it("carries leftover distance across add calls", () => {
    const whole = gen(testBrush()).add(line(0, 100, 7));
    const g = gen(testBrush());
    const pts = line(0, 100, 7);
    const halves = [...g.add(pts.slice(0, 8)), ...g.add(pts.slice(8))];
    expect(halves.length).toBe(whole.length);
    expect(halves.map((d) => Math.round(d.x))).toEqual(whole.map((d) => Math.round(d.x)));
  });

  // Fails if the minimum 1 px step is dropped: a tiny tip would stamp thousands of dabs per pixel.
  it("never steps less than a pixel", () => {
    const b = testBrush();
    b.tip.size = 2;
    b.tip.spacing = 0.01;
    expect(gen(b).add(line(0, 50)).length).toBeLessThanOrEqual(52);
  });

  // Fails if a curved pass is a polyline: a fast bend must overshoot the chord between samples.
  it("curves through the samples instead of cutting corners", () => {
    const dabs = gen(testBrush()).add([sample(0, 0), sample(50, 0), sample(100, 50), sample(100, 100)]);
    const nearCorner = dabs.filter((d) => d.x > 70 && d.y > 10 && d.y < 40);
    expect(nearCorner.length).toBeGreaterThan(0);
    // The chord from (50,0) to (100,50) is y = x - 50; a smooth curve sits off it somewhere.
    expect(nearCorner.some((d) => Math.abs(d.y - (d.x - 50)) > 1)).toBe(true);
  });

  // Fails if a single tap lays nothing.
  it("a tap stamps one dab on finish", () => {
    const g = gen(testBrush());
    expect(g.add([sample(30, 30)])).toEqual([]);
    expect(g.finish().length).toBe(1);
  });
});

describe("DabGenerator dynamics", () => {
  const pressureSize = () =>
    testBrush({ shape: { size: { jitter: 0, control: "pressure", minimum: 0.1 }, angle: V, roundness: V } });

  // Fails if a mouse stroke does not fall back to fade: a mouse has no pressure so size would stay constant.
  it("a mouse stroke with pressure-controlled size thins with distance", () => {
    const b = pressureSize();
    b.fadeLength = 100;
    const dabs = gen(b).add(line(0, 100, 10, { pointer: "mouse", pressure: 0.5 }));
    const first = dabs[0]?.size ?? 0;
    const last = dabs[dabs.length - 1]?.size ?? 0;
    expect(first).toBeCloseTo(20, 0);
    expect(last).toBeLessThan(first * 0.4);
  });

  // Fails if a pen ignores pressure, or applies the fade fallback to it.
  it("a pen stroke follows pressure, not distance", () => {
    const b = pressureSize();
    b.fadeLength = 100;
    const samples = line(0, 100, 10).map((s, i) => ({ ...s, pressure: i < 5 ? 0.1 : 1 }));
    const dabs = gen(b).add(samples);
    const early = dabs.find((d) => d.x < 20);
    const late = dabs.find((d) => d.x > 80);
    // Both ends must have a dab, or the comparison below would pass against nothing.
    expect(early).toBeDefined();
    expect(late).toBeDefined();
    expect(late?.size).toBeGreaterThan((early?.size ?? Infinity) * 2);
  });

  // Fails if the size minimum is not a floor: jitter could shrink a dab to nothing.
  it("size never drops below minimum * size, whatever the jitter", () => {
    const b = testBrush({ shape: { size: { jitter: 1, control: "off", minimum: 0.5 }, angle: V, roundness: V } });
    for (const d of gen(b, 9).add(line(0, 300))) expect(d.size).toBeGreaterThanOrEqual(10 - 1e-9);
  });

  // Fails if followDirection is ignored: a flat tip must turn with the stroke.
  it("followDirection turns the tip with the heading", () => {
    const b = testBrush();
    b.tip.followDirection = true;
    b.tip.angle = 90;
    const down = gen(b).add([sample(10, 0), sample(10, 40), sample(10, 80)]);
    expect(down[2]?.angle).toBeCloseTo(180, 0);
    const right = gen(b).add(line(0, 80));
    expect(right[2]?.angle).toBeCloseTo(90, 0);
  });

  // Fails if scatter adds no offset, or leaves the offset on the path axis only when bothAxes asks for more.
  it("scatter moves dabs off the path and adds copies by count", () => {
    const b = testBrush({ scatter: { amount: 1, bothAxes: false, count: 3, countJitter: 0 } });
    const dabs = gen(b).add(line(0, 40));
    expect(dabs.length).toBeGreaterThan(20);
    expect(dabs.some((d) => Math.abs(d.y - 50) > 2)).toBe(true);
    expect(dabs.every((d) => Math.abs(d.y - 50) <= 20 + 1e-9)).toBe(true);
  });

  // Fails if colour jitter is applied without brush.colour, or never applied with it.
  it("varies colour only when the brush asks for it", () => {
    expect(gen(testBrush()).add(line(0, 40)).every((d) => d.colour === null)).toBe(true);
    const b = testBrush({ colour: { hue: 0.4, saturation: 0.2, value: 0.2 } });
    const colours = gen(b).add(line(0, 40)).map((d) => d.colour);
    expect(new Set(colours.map((c) => `${Math.round(c?.r ?? -1)},${Math.round(c?.g ?? -1)}`)).size).toBeGreaterThan(3);
  });

  // Fails if any randomness bypasses the seeded rng.
  it("same samples and seed give the same dabs, a different seed differs", () => {
    const b = testBrush({
      shape: { size: { jitter: 0.5, control: "off", minimum: 0 }, angle: { jitter: 1, control: "off", minimum: 0 }, roundness: V },
      scatter: { amount: 0.5, bothAxes: true, count: 1, countJitter: 0 },
    });
    const a = gen(b, 4).add(line(0, 100));
    expect(gen(b, 4).add(line(0, 100))).toEqual(a);
    expect(gen(b, 5).add(line(0, 100))).not.toEqual(a);
  });

  // Fails if smoothing 0 lags, or a high setting does not trail the pen.
  it("smoothing lags behind the pen, and 0 follows it exactly", () => {
    const raw = gen(testBrush({ smoothing: 0 })).add([sample(0, 0), sample(100, 0)]);
    expect(raw[raw.length - 1]?.x).toBeGreaterThan(90);
    const smooth = gen(testBrush({ smoothing: 0.9 })).add([sample(0, 0), sample(100, 0)]);
    expect(smooth[smooth.length - 1]?.x).toBeLessThan(30);
  });
});
