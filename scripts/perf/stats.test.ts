import { describe, expect, it } from "vitest";
import { median, medianIndex, medianOrNull } from "./stats";

describe("median", () => {
  it("takes the middle of an odd list regardless of order", () => {
    expect(median([9, 1, 5])).toBe(5);
  });
  it("averages the middle pair of an even list", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
  it("refuses an empty list rather than inventing a number", () => {
    expect(() => median([])).toThrow();
  });
});

describe("medianOrNull", () => {
  it("ignores runs that could not measure the metric", () => {
    expect(medianOrNull([null, 4, 8, null, 6])).toBe(6);
  });
  it("is null when no run measured it", () => {
    expect(medianOrNull([null, null])).toBeNull();
  });
});

describe("medianIndex", () => {
  it("points at the run holding the median", () => {
    expect(medianIndex([30, 10, 20])).toBe(2);
  });
  it("takes the lower middle of an even list", () => {
    expect(medianIndex([40, 10, 30, 20])).toBe(3);
  });
});
