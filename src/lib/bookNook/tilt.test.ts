import { describe, expect, it } from "vitest";
import { recentre, smoothTilt, tiltFromOrientation } from "./tilt.ts";

const level = { beta: 60, gamma: 0 };

describe("tiltFromOrientation", () => {
  it("is level at the level angle", () => {
    expect(tiltFromOrientation(level, level, 0)).toEqual({ x: 0, y: 0 });
  });
  it("reaches 1 at 20 degrees and never beyond (fails without the clamp)", () => {
    expect(tiltFromOrientation({ beta: 60, gamma: 20 }, level, 0).x).toBeCloseTo(1);
    expect(tiltFromOrientation({ beta: 60, gamma: 70 }, level, 0).x).toBe(1);
    expect(tiltFromOrientation({ beta: 0, gamma: 0 }, level, 0).y).toBe(-1);
  });
  it("keeps 'right' on the right when the screen is turned (fails if screenAngle is ignored)", () => {
    // Tilting the phone's own right side down is "toward screen-right" in portrait; turned 90 degrees that
    // same tilt is along the screen's vertical, and a tilt of the top edge is along the horizontal.
    const sideways = tiltFromOrientation({ beta: 60, gamma: 10 }, level, 90);
    expect(sideways.x).toBeCloseTo(0);
    expect(sideways.y).toBeCloseTo(-0.5);
    expect(tiltFromOrientation({ beta: 70, gamma: 0 }, level, 90).x).toBeCloseTo(0.5);
    expect(tiltFromOrientation({ beta: 60, gamma: 10 }, level, 180).x).toBeCloseTo(-0.5);
    expect(tiltFromOrientation({ beta: 70, gamma: 0 }, level, 270).x).toBeCloseTo(-0.5);
    expect(tiltFromOrientation({ beta: 60, gamma: 10 }, level, 270).y).toBeCloseTo(0.5);
  });
  it("reads a negative angle as the same quarter turn the other way round", () => {
    expect(tiltFromOrientation({ beta: 60, gamma: 10 }, level, -90)).toEqual(tiltFromOrientation({ beta: 60, gamma: 10 }, level, 270));
  });
});

describe("smoothTilt", () => {
  it("covers about 63 per cent of the gap in one time constant", () => {
    expect(smoothTilt({ x: 0, y: 0 }, { x: 1, y: -1 }, 0.2).x).toBeCloseTo(1 - Math.exp(-1));
  });
  it("does not move without time passing, and never overshoots", () => {
    expect(smoothTilt({ x: 0.3, y: 0 }, { x: 1, y: 0 }, 0)).toEqual({ x: 0.3, y: 0 });
    expect(smoothTilt({ x: 0, y: 0 }, { x: 1, y: 0 }, 100).x).toBeLessThanOrEqual(1);
  });
});

describe("recentre", () => {
  const now = { beta: 80, gamma: 10 };
  it("leaves the level alone before the phone has been still for 3 seconds", () => {
    expect(recentre(level, now, 2.9, 1)).toBe(level);
  });
  it("eases the level toward the phone after that, without jumping", () => {
    const next = recentre(level, now, 3.5, 0.5);
    expect(next.beta).toBeGreaterThan(60);
    expect(next.beta).toBeLessThan(80);
    expect(next.gamma).toBeGreaterThan(0);
    expect(next.gamma).toBeLessThan(10);
  });
});
