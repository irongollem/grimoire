import { describe, expect, it } from "vitest";
import { frameSlices } from "./frameSlices";

describe("frameSlices", () => {
  // Bug: a 2:3 arch frame stretched over a 9:19.5 phone, its round arch squashed into a tall oval.
  it("keeps a tall frame's ends at their painted shape on a taller phone and stretches only the middle", () => {
    const [top, middle, bottom] = frameSlices({ width: 1024, height: 1536 }, { width: 390, height: 845 });
    const scale = 390 / 1024;
    expect(top.to[3] / top.from[3]).toBeCloseTo(scale);
    expect(top.to[2] / top.from[2]).toBeCloseTo(scale);
    expect(bottom.to[1] + bottom.to[3]).toBeCloseTo(845);
    expect(middle.to[1]).toBeCloseTo(top.to[3]);
    expect(middle.to[1] + middle.to[3]).toBeCloseTo(bottom.to[1]);
  });

  // Bug: a 3:2 frame on a 16:9 TV, its corner ornaments stretched sideways.
  it("keeps a wide frame's ends on a wider TV and stretches only the middle band across", () => {
    const [left, , right] = frameSlices({ width: 1536, height: 1024 }, { width: 1920, height: 1080 });
    expect(left.to[2] / left.from[2]).toBeCloseTo(1080 / 1024);
    expect(right.to[0] + right.to[2]).toBeCloseTo(1920);
  });

  it("draws a frame whole on a screen of its own shape", () => {
    expect(frameSlices({ width: 1024, height: 1536 }, { width: 512, height: 768 })).toHaveLength(1);
  });
});
