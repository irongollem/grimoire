import { describe, expect, it } from "vitest";
import { standInVariant } from "./packLoader";

describe("standInVariant", () => {
  it("borrows a drawn sibling for a variant with no art", () => {
    const drawn = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(standInVariant(drawn, 8)).toBe(0);
    expect(standInVariant(drawn, 9)).toBe(1);
  });

  it("is the same answer however the drawn list arrives", () => {
    expect(standInVariant([3, 0, 5], 4)).toBe(standInVariant([0, 3, 5], 4));
  });

  it("works when the drawn variants are not contiguous", () => {
    expect(standInVariant([2, 5], 0)).toBe(2);
    expect(standInVariant([2, 5], 1)).toBe(5);
  });

  it("has nothing to offer a group with no drawn art", () => {
    expect(standInVariant([], 3)).toBeNull();
  });
});
