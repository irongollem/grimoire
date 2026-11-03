import { describe, expect, it } from "vitest";
import { createWheelStep, wheelPixels } from "./wheelStep";

function stepper() {
  let t = 1000;
  const step = createWheelStep(() => t, 40, 350);
  return { step, advance: (ms: number) => (t += ms) };
}

describe("createWheelStep", () => {
  it("moves one row for a trackpad swipe of many small events, not one per event", () => {
    const { step, advance } = stepper();
    const moves: number[] = [];
    for (let i = 0; i < 20; i++) {
      moves.push(step(8));
      advance(10);
    }
    // 160px in 200ms: past the threshold once, and never again inside the repeat window.
    expect(moves.filter((m) => m !== 0)).toEqual([1]);
  });

  it("keeps stepping while the scroll goes on, one row per repeat window", () => {
    const { step, advance } = stepper();
    expect(step(100)).toBe(1);
    advance(100);
    expect(step(100)).toBe(0);
    advance(300);
    expect(step(100)).toBe(1);
  });

  it("needs the full distance again after a step, so a twitch later does not move it", () => {
    const { step, advance } = stepper();
    expect(step(100)).toBe(1);
    advance(500);
    expect(step(1)).toBe(0);
  });

  it("steps up on a scroll up", () => {
    const { step } = stepper();
    expect(step(-100)).toBe(-1);
  });

  it("does not move for a nudge below the threshold", () => {
    const { step } = stepper();
    expect(step(10)).toBe(0);
    expect(step(10)).toBe(0);
  });

  it("does not let distance scrolled down cancel a scroll back up", () => {
    const { step, advance } = stepper();
    expect(step(30)).toBe(0);
    advance(500);
    // Without the reset this nets to -15 and never steps.
    expect(step(-45)).toBe(-1);
  });
});

describe("wheelPixels", () => {
  it("turns lines and pages into pixels, so a Firefox mouse notch still clears the threshold", () => {
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 })).toBe(400);
    expect(wheelPixels({ deltaY: 12, deltaMode: 0 })).toBe(12);
  });
});
