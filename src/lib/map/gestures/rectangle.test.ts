import { describe, it, expect } from "vitest";
import { cellsInRect, rectangleGesture } from "./rectangle";

describe("cellsInRect", () => {
  it("covers the inclusive bounding box regardless of corner order", () => {
    expect(new Set(cellsInRect(0, 0, 1, 1))).toEqual(new Set(["0,0", "1,0", "0,1", "1,1"]));
    expect(new Set(cellsInRect(1, 1, 0, 0))).toEqual(new Set(["0,0", "1,0", "0,1", "1,1"]));
  });

  it("returns a single cell for a degenerate rect", () => {
    expect(cellsInRect(2, 2, 2, 2)).toEqual(["2,2"]);
  });
});

describe("rectangleGesture", () => {
  it("carries the variant flag through unused", () => {
    expect(rectangleGesture(0, 0, 0, 0, true).variant).toBe(true);
    expect(rectangleGesture(0, 0, 0, 0, false).variant).toBe(false);
  });

  it("cells match cellsInRect", () => {
    expect(rectangleGesture(0, 0, 1, 1, false).cells).toEqual(cellsInRect(0, 0, 1, 1));
  });
});
