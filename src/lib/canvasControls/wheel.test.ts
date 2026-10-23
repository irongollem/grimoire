import { describe, it, expect } from "vitest";
import { resolveWheel, type WheelEventLike } from "./wheel";

const wheel = (over: Partial<WheelEventLike>): WheelEventLike => ({
  deltaX: 0, deltaY: 0, deltaMode: 0,
  ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  ...over,
});

const ZOOM_PER_PX = Math.log(1.1) / 100;

describe("resolveWheel", () => {
  it("pans on a plain wheel, by both deltas", () => {
    expect(resolveWheel(wheel({ deltaX: 12, deltaY: 40 }))).toEqual({ kind: "pan", dx: 12, dy: 40 });
  });

  it("zooms in on Ctrl+wheel up by about 10% per notch", () => {
    const intent = resolveWheel(wheel({ deltaY: -100, ctrlKey: true }));
    if (intent.kind !== "zoom") throw new Error("expected zoom");
    expect(intent.factor).toBeCloseTo(1.1, 10);
  });

  it("zooms out on a notch down", () => {
    const intent = resolveWheel(wheel({ deltaY: 100, metaKey: true }));
    if (intent.kind !== "zoom") throw new Error("expected zoom");
    expect(intent.factor).toBeCloseTo(1 / 1.1, 10);
  });

  it("Alt+wheel zooms too", () => {
    expect(resolveWheel(wheel({ deltaY: -100, altKey: true })).kind).toBe("zoom");
  });

  it("a pinch (ctrl plus a small fractional delta) zooms by a small, proportional amount", () => {
    const intent = resolveWheel(wheel({ deltaY: -2.5, ctrlKey: true }));
    if (intent.kind !== "zoom") throw new Error("expected zoom");
    expect(intent.factor).toBeCloseTo(Math.exp(2.5 * ZOOM_PER_PX), 10);
    expect(intent.factor).toBeGreaterThan(1);
    expect(intent.factor).toBeLessThan(1.01);
  });

  it("clamps a single event's factor to [0.5, 2]", () => {
    expect(resolveWheel(wheel({ deltaY: -100000, ctrlKey: true }))).toEqual({ kind: "zoom", factor: 2 });
    expect(resolveWheel(wheel({ deltaY: 100000, ctrlKey: true }))).toEqual({ kind: "zoom", factor: 0.5 });
  });

  it("Shift+wheel scrolls sideways using deltaY when there is no deltaX", () => {
    expect(resolveWheel(wheel({ deltaY: 60, shiftKey: true }))).toEqual({ kind: "pan", dx: 60, dy: 0 });
  });

  it("Shift+wheel keeps a deltaX the OS already supplied", () => {
    expect(resolveWheel(wheel({ deltaX: 30, deltaY: 0, shiftKey: true }))).toEqual({ kind: "pan", dx: 30, dy: 0 });
    expect(resolveWheel(wheel({ deltaX: 30, deltaY: 5, shiftKey: true }))).toEqual({ kind: "pan", dx: 30, dy: 5 });
  });

  it("normalises line and page deltas to pixels", () => {
    expect(resolveWheel(wheel({ deltaY: 3, deltaMode: 1 }))).toEqual({ kind: "pan", dx: 0, dy: 48 });
    expect(resolveWheel(wheel({ deltaY: 1, deltaMode: 2 }))).toEqual({ kind: "pan", dx: 0, dy: 800 });
  });

  it("normalises line deltas before zooming", () => {
    // 6 lines = 96 px.
    const intent = resolveWheel(wheel({ deltaY: -6, deltaMode: 1, ctrlKey: true }));
    if (intent.kind !== "zoom") throw new Error("expected zoom");
    expect(intent.factor).toBeCloseTo(Math.exp(96 * ZOOM_PER_PX), 10);
  });

  it("zoom wins over Shift when a zoom modifier is held", () => {
    expect(resolveWheel(wheel({ deltaY: -100, ctrlKey: true, shiftKey: true })).kind).toBe("zoom");
  });
});
