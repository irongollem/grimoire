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

  it("starts and ends on the given endpoints regardless of direction", () => {
    const forward = cellsInLine(0, 0, 4, 2);
    expect(forward[0]).toBe("0,0");
    expect(forward[forward.length - 1]).toBe("4,2");
    const backward = cellsInLine(4, 2, 0, 0);
    expect(backward[0]).toBe("4,2");
    expect(backward[backward.length - 1]).toBe("0,0");
  });
});
