import { describe, expect, it } from "vitest";
import { behindHandleFor, behindPick, pointOnGlyph, resizeCorner, type BehindBox } from "./behindHit";

const box = (id: string, left: number, top: number, right: number, bottom: number): BehindBox => ({
  id,
  left,
  top,
  right,
  bottom,
});

describe("behindPick", () => {
  const boxes = [box("a", 0, 0, 100, 100)];

  it("a press on a word over a picture puts the caret in the word, not the picture", () => {
    expect(behindPick({ x: 50, y: 50 }, boxes, true)).toBeNull();
  });

  it("a press in empty space over a picture picks it", () => {
    expect(behindPick({ x: 50, y: 50 }, boxes, false)).toBe("a");
  });

  it("a press outside every picture picks nothing", () => {
    expect(behindPick({ x: 150, y: 50 }, boxes, false)).toBeNull();
  });

  it("the topmost of two overlapping pictures is picked", () => {
    const two = [box("under", 0, 0, 100, 100), box("top", 50, 50, 150, 150)];
    expect(behindPick({ x: 75, y: 75 }, two, false)).toBe("top");
    expect(behindPick({ x: 10, y: 10 }, two, false)).toBe("under");
  });
});

describe("behindHandleFor", () => {
  it("shows anywhere inside the picture, words or not", () => {
    const boxes = [box("a", 0, 0, 100, 100)];
    expect(behindHandleFor({ x: 99, y: 1 }, boxes)).toBe("a");
    expect(behindHandleFor({ x: 101, y: 1 }, boxes)).toBeNull();
  });
});

describe("pointOnGlyph", () => {
  const glyph = { left: 10, top: 10, right: 20, bottom: 30 };

  it("is true inside a glyph box and a pixel or two beside it", () => {
    expect(pointOnGlyph({ x: 15, y: 20 }, [glyph])).toBe(true);
    expect(pointOnGlyph({ x: 21, y: 20 }, [glyph])).toBe(true);
  });

  it("is false in empty space beside a short line", () => {
    expect(pointOnGlyph({ x: 40, y: 20 }, [glyph])).toBe(false);
    expect(pointOnGlyph({ x: 15, y: 20 }, [])).toBe(false);
  });
});

describe("resizeCorner", () => {
  it("is bottom-right for a free picture and the corner opposite the pin for a pinned one", () => {
    expect(resizeCorner(undefined)).toBe("bottom-right");
    expect(resizeCorner("top-left")).toBe("bottom-right");
    expect(resizeCorner("bottom-right")).toBe("top-left");
    expect(resizeCorner("top-right")).toBe("bottom-left");
    expect(resizeCorner("bottom-left")).toBe("top-right");
  });
});
