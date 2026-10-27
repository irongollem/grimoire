import { describe, it, expect } from "vitest";
import { cellsInLine } from "./line";

describe("cellsInLine", () => {
  it("returns a single cell for a degenerate line", () => {
    expect(cellsInLine(1, 1, 1, 1)).toEqual(["1,1"]);
  });

  it("draws a horizontal line inclusive of both endpoints", () => {
    expect(cellsInLine(0, 0, 3, 0)).toEqual(["0,0", "1,0", "2,0", "3,0"]);
  });

  it("draws a vertical line inclusive of both endpoints", () => {
    expect(cellsInLine(0, 0, 0, 3)).toEqual(["0,0", "0,1", "0,2", "0,3"]);
  });

  it("draws a 45° diagonal exactly", () => {
    expect(cellsInLine(0, 0, 3, 3)).toEqual(["0,0", "1,1", "2,2", "3,3"]);
  });

  it("steps along the shallow axis and bumps the other when the error crosses half a cell", () => {
    // y = 0.4x never lands on a half cell, so there is one correct line: y rounds to 0,0,1,1,2,2.
    const expected = ["0,0", "1,0", "2,1", "3,1", "4,2", "5,2"];
    expect(cellsInLine(0, 0, 5, 2)).toEqual(expected);
    expect(new Set(cellsInLine(5, 2, 0, 0))).toEqual(new Set(expected));
    // A slope of exactly one half: the classic Bresenham walk.
    expect(cellsInLine(0, 0, 4, 2)).toEqual(["0,0", "1,0", "2,1", "3,1", "4,2"]);
    expect(cellsInLine(0, 0, 2, 4)).toEqual(["0,0", "0,1", "1,2", "1,3", "2,4"]);
  });

  it("starts and ends on the given endpoints regardless of direction", () => {
    const forward = cellsInLine(0, 0, 4, 2);
    expect(forward[0]).toBe("0,0");
    expect(forward[forward.length - 1]).toBe("4,2");
    const backward = cellsInLine(4, 2, 0, 0);
    expect(backward[0]).toBe("4,2");
    expect(backward[backward.length - 1]).toBe("0,0");
  });
});
