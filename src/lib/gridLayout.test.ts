import { describe, expect, it } from "vitest";
import { autoFillColumns, rowCount, rowItems, rowOfItem } from "./gridLayout";

describe("autoFillColumns", () => {
  it("fits tracks with a gap between each pair", () => {
    // 3 x 100 + 2 x 10 = 320
    expect(autoFillColumns(320, 100, 10)).toBe(3);
    expect(autoFillColumns(319, 100, 10)).toBe(2);
  });
  it("never reports fewer than one column", () => {
    expect(autoFillColumns(50, 100, 10)).toBe(1);
    expect(autoFillColumns(0, 100, 10)).toBe(1);
  });
});

describe("row chunking", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  it("counts rows, rounding the last partial one up", () => {
    expect(rowCount(7, 3)).toBe(3);
    expect(rowCount(6, 3)).toBe(2);
    expect(rowCount(0, 3)).toBe(0);
  });
  it("slices rows, the last one short", () => {
    expect(rowItems(items, 3, 0)).toEqual([1, 2, 3]);
    expect(rowItems(items, 3, 2)).toEqual([7]);
    expect(rowItems(items, 3, 3)).toEqual([]);
  });
  it("finds the row of an item", () => {
    expect(rowOfItem(0, 3)).toBe(0);
    expect(rowOfItem(5, 3)).toBe(1);
    expect(rowOfItem(6, 3)).toBe(2);
  });
});
