import { describe, it, expect } from "vitest";
import { snapCellToAngle, snapToAngle, squareCorner } from "./constrain";

describe("snapToAngle", () => {
  it("returns the origin for a zero-length drag", () => {
    expect(snapToAngle([2.5, 3.5], [2.5, 3.5])).toEqual([2.5, 3.5]);
  });

  it("locks a near-horizontal drag to the axis with the perpendicular exact", () => {
    expect(snapToAngle([0, 0], [10, 1])).toEqual([10, 0]);
    expect(snapToAngle([1.25, 2.5], [11.25, 3])).toEqual([11.25, 2.5]);
  });

  it("locks leftward and vertical drags", () => {
    expect(snapToAngle([0, 0], [-5, 0.2])).toEqual([-5, 0]);
    expect(snapToAngle([0, 0], [0.3, -4])).toEqual([0, -4]);
    expect(snapToAngle([0, 0], [0.3, 4])).toEqual([0, 4]);
  });

  it("projects onto a diagonal, preserving length along the ray", () => {
    const [x, y] = snapToAngle([0, 0], [3, 4]);
    expect(x).toBeCloseTo(3.5, 10);
    expect(y).toBeCloseTo(3.5, 10);
  });

  it("supports a custom step", () => {
    // 90 degree steps: a 40 degree drag snaps to the x axis.
    expect(snapToAngle([0, 0], [4, 3.3], 90)).toEqual([4, 0]);
  });
});

describe("snapCellToAngle", () => {
  it("returns the origin for a zero-length drag", () => {
    expect(snapCellToAngle(3, 3, 3, 3)).toEqual([3, 3]);
  });

  it("snaps to horizontal and vertical", () => {
    expect(snapCellToAngle(0, 0, 5, 1)).toEqual([5, 0]);
    expect(snapCellToAngle(0, 0, 1, 5)).toEqual([0, 5]);
    expect(snapCellToAngle(0, 0, -6, -1)).toEqual([-6, 0]);
  });

  it("snaps to an exact diagonal with the rounded projection", () => {
    expect(snapCellToAngle(0, 0, 4, 3)).toEqual([4, 4]);
    expect(snapCellToAngle(0, 0, -4, -3)).toEqual([-4, -4]);
    expect(snapCellToAngle(10, 10, 7, 12)).toEqual([7, 13]);
  });

  it("goes diagonal for any drag steeper than 22.5 and shallower than 67.5 degrees, from either axis", () => {
    // (7,5) is 35.5 degrees: the projection onto the diagonal is (7+5)/2 = 6, not the longer side.
    expect(snapCellToAngle(0, 0, 7, 5)).toEqual([6, 6]);
    // (5,7) is 54.5 degrees, past 45 but short of 67.5, so it is still a diagonal.
    expect(snapCellToAngle(0, 0, 5, 7)).toEqual([6, 6]);
  });
});

describe("squareCorner", () => {
  it("uses the longer axis as the side", () => {
    expect(squareCorner(0, 0, 3, -5)).toEqual([5, -5]);
    expect(squareCorner(2, 2, 6, 3)).toEqual([6, 6]);
  });

  it("keeps the drag direction in each axis", () => {
    expect(squareCorner(5, 5, 2, 4)).toEqual([2, 2]);
    expect(squareCorner(5, 5, 8, 4)).toEqual([8, 2]);
  });

  it("treats a zero axis as positive", () => {
    expect(squareCorner(1, 1, 1, 4)).toEqual([4, 4]);
  });

  it("is degenerate for a zero drag", () => {
    expect(squareCorner(2, 2, 2, 2)).toEqual([2, 2]);
  });
});
