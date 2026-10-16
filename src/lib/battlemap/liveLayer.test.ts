import { describe, it, expect } from "vitest";
import { hasMotion, overlayFrame } from "./liveLayer";
import type { MotionOverlay } from "@/types/mapLive.types";

const base: MotionOverlay = { url: "u", cells: 4, drift: [0.5, -0.25], alpha: 0.6 };

describe("overlayFrame", () => {
  it("sizes the tile from its cells and the cell size", () => {
    expect(overlayFrame(base, 50, 0, 0, 0).size).toBe(200);
  });

  it("anchors the offset to the map origin and drifts with time", () => {
    const f = overlayFrame(base, 50, 30, 10, 2);
    // x: 30 + 0.5*2*50 = 80; y: 10 + -0.25*2*50 = -15, wrapped into [0, 200)
    expect(f.offsetX).toBe(80);
    expect(f.offsetY).toBe(185);
  });

  it("wraps the offset into [0, size) for negative origins and long times", () => {
    const f = overlayFrame(base, 50, -430, 0, 1000);
    expect(f.offsetX).toBeGreaterThanOrEqual(0);
    expect(f.offsetX).toBeLessThan(200);
    expect(f.offsetY).toBeGreaterThanOrEqual(0);
    expect(f.offsetY).toBeLessThan(200);
  });

  it("holds the base alpha without breathing", () => {
    expect(overlayFrame(base, 50, 0, 0, 7).alpha).toBe(0.6);
  });

  it("breathes the alpha and clamps it to 0..1", () => {
    const breathing = { ...base, alpha: 0.8, breathe: { amount: 0.5, speed: Math.PI, phase: 0 } };
    expect(overlayFrame(breathing, 50, 0, 0, 0.5).alpha).toBe(1);
    expect(overlayFrame(breathing, 50, 0, 0, 1.5).alpha).toBeCloseTo(0.4);
    expect(overlayFrame({ ...breathing, breathe: { amount: 5, speed: Math.PI, phase: 0 } }, 50, 0, 0, 1.5).alpha).toBe(0);
  });
});

describe("hasMotion", () => {
  it("needs at least one overlay", () => {
    expect(hasMotion(null)).toBe(false);
    expect(hasMotion({ groups: [{ overlays: [] }] })).toBe(false);
    expect(hasMotion({ groups: [{ overlays: [], }, { overlays: [base] }] })).toBe(true);
  });
});
