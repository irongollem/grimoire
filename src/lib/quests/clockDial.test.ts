import { describe, expect, it } from "vitest";
import { clockProgressLabel, clockSegmentPath } from "./clockDial";

describe("clockSegmentPath", () => {
  it("draws a closed wedge and differs per segment", () => {
    const first = clockSegmentPath(0, 4, 20, 18, 9);
    expect(first.startsWith("M ")).toBe(true);
    expect(first.endsWith("Z")).toBe(true);
    expect(clockSegmentPath(1, 4, 20, 18, 9)).not.toBe(first);
  });

  it("starts the first segment just right of twelve o'clock", () => {
    const [x, y] = clockSegmentPath(0, 4, 20, 18, 9).slice(2).split(" A")[0]!.split(" ").map(Number);
    expect(x!).toBeGreaterThan(20);
    expect(y!).toBeLessThan(20);
  });

  it("uses the small arc for every segment count the app allows", () => {
    for (let n = 3; n <= 12; n += 1) {
      expect(clockSegmentPath(0, n, 20, 18, 9)).toContain(" 0 0 1 ");
    }
  });
});

describe("clockProgressLabel", () => {
  it("reads as a fraction", () => {
    expect(clockProgressLabel(3, 4)).toBe("3 of 4");
  });
});
