import { describe, expect, it } from "vitest";
import { stretchedHighPass } from "./scanGrains";

describe("stretchedHighPass", () => {
  it("removes the blurred tone and stretches what is left to the full 0-255 range", () => {
    // Fails on: a grain left at a narrow band around grey (brushes would barely catch it) or tone left in (a stain acting as tooth).
    const grey = Uint8Array.from([100, 110, 120, 130]);
    const blurred = Uint8Array.from([105, 105, 125, 125]);
    const out = stretchedHighPass(grey, blurred);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
    // Differences are -5, 5, -5, 5: both pairs land on the same level.
    expect(out[0]).toBe(out[2]);
    expect(out[1]).toBe(out[3]);
  });

  it("does not divide by zero on a flat scan", () => {
    // Fails on: NaN pixels from a scan with no tooth at all.
    const flat = Uint8Array.from([90, 90]);
    expect([...stretchedHighPass(flat, flat)]).toEqual([0, 0]);
  });
});
