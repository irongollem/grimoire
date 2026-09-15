import { describe, it, expect } from "vitest";
import type { GridPoint } from "@/types/locationMapRegion.types";
import {
  addDraftPoint,
  canCloseDraft,
  closeDraft,
  abandonDraft,
  moveRingVertex,
  deleteRingVertex,
  insertRingVertex,
  isNearFirstNode,
  startTemplateDrag,
  updateTemplateDrag,
} from "./pen";

const TRIANGLE: GridPoint[] = [
  [0, 0],
  [4, 0],
  [2, 4],
];

describe("addDraftPoint", () => {
  it("appends a point", () => {
    expect(addDraftPoint([], [1, 1])).toEqual([[1, 1]]);
    expect(addDraftPoint([[0, 0]], [1, 1])).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe("canCloseDraft / closeDraft", () => {
  it("refuses to close below 3 distinct points", () => {
    expect(canCloseDraft([])).toBe(false);
    expect(canCloseDraft([[0, 0]])).toBe(false);
    expect(closeDraft([[0, 0]])).toBeNull();
  });

  it("closes and simplifies once 3 distinct points exist", () => {
    expect(canCloseDraft(TRIANGLE)).toBe(true);
    expect(closeDraft(TRIANGLE)).toEqual(TRIANGLE);
  });

  it("drops a collinear midpoint on close", () => {
    const withMidpoint: GridPoint[] = [
      [0, 0],
      [2, 0],
      [4, 0],
      [2, 4],
    ];
    expect(closeDraft(withMidpoint)).toEqual(TRIANGLE);
  });
});

describe("abandonDraft", () => {
  it("always returns an empty ring", () => {
    expect(abandonDraft()).toEqual([]);
  });
});

describe("moveRingVertex / deleteRingVertex / insertRingVertex", () => {
  it("moves the vertex at the given index", () => {
    expect(moveRingVertex(TRIANGLE, 0, [9, 9])).toEqual([
      [9, 9],
      [4, 0],
      [2, 4],
    ]);
  });

  it("refuses to delete below 3 points", () => {
    expect(deleteRingVertex(TRIANGLE, 0)).toEqual(TRIANGLE);
  });

  it("deletes a vertex once above 3 points", () => {
    const square: GridPoint[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    expect(deleteRingVertex(square, 0)).toEqual([
      [4, 0],
      [4, 4],
      [0, 4],
    ]);
  });

  it("inserts a vertex after the given index", () => {
    expect(insertRingVertex(TRIANGLE, 0, [2, 0])).toEqual([
      [0, 0],
      [2, 0],
      [4, 0],
      [2, 4],
    ]);
  });
});

describe("isNearFirstNode", () => {
  it("is false when the ring isn't closeable yet", () => {
    expect(isNearFirstNode([[0, 0]], 0, 0, 1)).toBe(false);
  });

  it("is true only near the ring's own first point", () => {
    expect(isNearFirstNode(TRIANGLE, 0.2, 0.2, 0.5)).toBe(true);
    expect(isNearFirstNode(TRIANGLE, 4, 0.2, 0.5)).toBe(false);
    expect(isNearFirstNode(TRIANGLE, 20, 20, 0.5)).toBe(false);
  });
});

describe("template drag", () => {
  it("starts at radius 0 and grows with distance from the centre", () => {
    const started = startTemplateDrag("octagon", [5, 5]);
    expect(started).toEqual({ shape: "octagon", center: [5, 5], radius: 0 });
    const dragged = updateTemplateDrag(started, [8, 5]);
    expect(dragged.radius).toBe(3);
  });

  it("rounds the radius to whole cells", () => {
    const started = startTemplateDrag("circle", [0, 0]);
    const dragged = updateTemplateDrag(started, [2, 2]);
    expect(dragged.radius).toBe(Math.round(Math.hypot(2, 2)));
  });
});
