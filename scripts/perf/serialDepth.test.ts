import { describe, expect, it } from "vitest";
import { chainPositions, serialDepth, settledTime } from "./serialDepth";

describe("serialDepth", () => {
  it("is 0 with no requests", () => {
    expect(serialDepth([])).toBe(0);
  });

  it("is 1 when everything runs in parallel", () => {
    expect(
      serialDepth([
        { start: 0, end: 100 },
        { start: 10, end: 90 },
        { start: 20, end: 150 },
      ]),
    ).toBe(1);
  });

  it("counts a back-to-back waterfall", () => {
    expect(
      serialDepth([
        { start: 0, end: 100 },
        { start: 100, end: 200 },
        { start: 250, end: 300 },
      ]),
    ).toBe(3);
  });

  it("takes the longest chain, not the most recent one", () => {
    // a -> b -> c is a chain of 3; d overlaps everything and adds nothing.
    expect(
      serialDepth([
        { start: 0, end: 50 },
        { start: 60, end: 120 },
        { start: 130, end: 200 },
        { start: 10, end: 190 },
      ]),
    ).toBe(3);
  });

  it("does not chain a request that started before the previous one finished", () => {
    expect(
      serialDepth([
        { start: 0, end: 100 },
        { start: 99, end: 200 },
      ]),
    ).toBe(1);
  });

  it("is independent of input order", () => {
    const a = { start: 0, end: 10 };
    const b = { start: 10, end: 20 };
    expect(serialDepth([b, a])).toBe(2);
  });
});

describe("settledTime", () => {
  it("is 0 with no requests", () => {
    expect(settledTime([], 0)).toBe(0);
  });

  it("ends at the last request of the first busy stretch", () => {
    expect(
      settledTime(
        [
          { start: 100, end: 300 },
          { start: 250, end: 700 },
          { start: 900, end: 950 },
        ],
        0,
      ),
    ).toBe(950);
  });

  it("ignores activity after a 500 ms quiet gap", () => {
    expect(
      settledTime(
        [
          { start: 0, end: 400 },
          { start: 1000, end: 1100 },
        ],
        0,
      ),
    ).toBe(400);
  });

  it("is measured from the window start and ignores the gap before the first request", () => {
    expect(settledTime([{ start: 2000, end: 2300 }], 1000)).toBe(1300);
  });
});

describe("chainPositions", () => {
  it("reports each request's link in input order, so a late request can be named", () => {
    // Input deliberately out of start order: c waits on b, which waits on a.
    expect(
      chainPositions([
        { start: 200, end: 300 },
        { start: 0, end: 100 },
        { start: 100, end: 200 },
        { start: 10, end: 90 },
      ]),
    ).toEqual([3, 1, 2, 1]);
  });

  it("is empty with no requests", () => {
    expect(chainPositions([])).toEqual([]);
  });
});
