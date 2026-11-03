import { describe, expect, it } from "vitest";
import { buildSegmentIndex, cellNum, latticeKey, latticeSegment, segmentAxis, segmentsIntersect } from "./walls";

describe("latticeSegment", () => {
  // app convention: edges are NW-owned, `"x,y:N"` is the top of cell (x,y), `"x,y:W"` its left.
  it("runs an N edge along the top of its cell and a W edge down its left", () => {
    expect(latticeSegment("3,4:N")).toEqual({ id: "3,4:N", a: [3, 4], b: [4, 4] });
    expect(latticeSegment("3,4:W")).toEqual({ id: "3,4:W", a: [3, 4], b: [3, 5] });
    expect(latticeSegment("-2,0:N")).toEqual({ id: "-2,0:N", a: [-2, 0], b: [-1, 0] });
  });

  it("refuses a key that names no side rather than inventing a wall", () => {
    expect(() => latticeSegment("3,4:S")).toThrow();
  });

  it("builds the key latticeSegment reads back", () => {
    expect(latticeSegment(latticeKey(5, 6, "W")).id).toBe("5,6:W");
  });
});

describe("segmentsIntersect", () => {
  it("crosses in the middle", () => {
    expect(segmentsIntersect([0, 0], [4, 4], [0, 4], [4, 0])).toBe(true);
  });

  it("counts touching at an end point (a ray through a wall's corner is stopped)", () => {
    expect(segmentsIntersect([0, 0], [2, 2], [2, 2], [2, 3])).toBe(true);
    expect(segmentsIntersect([0, 0], [4, 0], [2, 0], [2, 3])).toBe(true);
  });

  it("counts collinear overlap and not collinear separation", () => {
    expect(segmentsIntersect([0, 0], [3, 0], [2, 0], [5, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 0], [2, 0], [5, 0])).toBe(false);
  });

  it("misses parallel and short-of-the-line segments", () => {
    expect(segmentsIntersect([0, 0], [4, 0], [0, 1], [4, 1])).toBe(false);
    expect(segmentsIntersect([0, 0], [1, 1], [3, 0], [3, 5])).toBe(false);
  });
});

describe("segmentAxis", () => {
  it("tells a row line from a column line and calls an angle neither", () => {
    expect(segmentAxis([1, 2], [2, 2])).toBe("H");
    expect(segmentAxis([1, 2], [1, 3])).toBe("V");
    expect(segmentAxis([1, 2], [2, 3])).toBeNull();
  });
});

describe("buildSegmentIndex", () => {
  const filed = (index: ReturnType<typeof buildSegmentIndex>, x: number, y: number) =>
    (index.cells.get(cellNum(x, y)) ?? []).map((s) => s.id);

  it("files a wall on a grid line under the cells on both sides of it", () => {
    const index = buildSegmentIndex([latticeSegment("3,4:W")]);
    expect(filed(index, 3, 4)).toEqual(["3,4:W"]);
    expect(filed(index, 2, 4)).toEqual(["3,4:W"]);
    // Its far end is on the y = 5 line, so the cell below counts too: a ray through that corner must find it.
    expect(filed(index, 3, 5)).toEqual(["3,4:W"]);
    expect(filed(index, 3, 6)).toEqual([]);
  });

  it("files a diagonal under every cell it crosses and none it misses", () => {
    const index = buildSegmentIndex([{ id: "d", a: [0.5, 0.5], b: [3.5, 1.5] }]);
    for (const [x, y] of [[0, 0], [1, 0], [2, 1], [3, 1]]) expect(filed(index, x, y)).toEqual(["d"]);
    expect(filed(index, 0, 1)).toEqual([]);
    expect(filed(index, 3, 0)).toEqual([]);
  });

  it("is empty only with no segments", () => {
    expect(buildSegmentIndex([]).empty).toBe(true);
    expect(buildSegmentIndex([latticeSegment("0,0:N")]).empty).toBe(false);
  });
});
