import { describe, expect, it } from "vitest";
import { extendLayout, nearestAiSize, sendDimensions } from "./aiPicture";

describe("nearestAiSize", () => {
  // Bug: comparing ratios linearly sent a 2:1 banner to the square instead of the landscape oblong.
  it("picks the oblong whose shape is nearest, on a log scale", () => {
    expect(nearestAiSize(1000, 1000)).toBe("1024x1024");
    expect(nearestAiSize(2000, 1000)).toBe("1536x1024");
    expect(nearestAiSize(1000, 2000)).toBe("1024x1536");
    expect(nearestAiSize(1100, 1000)).toBe("1024x1024");
  });
});

describe("sendDimensions", () => {
  it("keeps the shape and caps the long edge, never scaling a small picture up", () => {
    expect(sendDimensions({ width: 3072, height: 2048 })).toEqual({ width: 1536, height: 1024 });
    expect(sendDimensions({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });
});

describe("extendLayout", () => {
  it("grows sideways into the landscape oblong, the picture at the far side from the edge", () => {
    const right = extendLayout({ width: 1000, height: 1000 }, "right");
    expect(right).toEqual({ size: "1536x1024", canvas: { width: 1536, height: 1024 }, picture: { x: 0, y: 0, width: 1024, height: 1024 } });
    // Bug: the picture sat on the edge it was meant to grow toward, leaving no margin on the page side.
    expect(extendLayout({ width: 1000, height: 1000 }, "left")?.picture.x).toBe(512);
  });

  it("grows up or down into the portrait oblong", () => {
    const bottom = extendLayout({ width: 1000, height: 1000 }, "bottom");
    expect(bottom?.picture).toEqual({ x: 0, y: 0, width: 1024, height: 1024 });
    expect(extendLayout({ width: 1000, height: 1000 }, "top")?.picture.y).toBe(512);
  });

  it("is null when the picture already fills the shape, so no credits are spent on an empty margin", () => {
    expect(extendLayout({ width: 3000, height: 1000 }, "right")).toBeNull();
    expect(extendLayout({ width: 1000, height: 3000 }, "bottom")).toBeNull();
  });
});
