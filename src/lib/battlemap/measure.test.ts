import { describe, expect, it } from "vitest";
import { measureFeet, snapToSquareMiddle } from "./measure";

describe("measureFeet", () => {
  // PHB 2024 "Moving": every square costs 5 ft, a diagonal square too. Euclid would read 21 ft here.
  it("counts a diagonal square as 5 ft, so three squares on the diagonal is 15 ft", () => {
    expect(measureFeet([[0.5, 0.5], [3.5, 3.5]])).toBe(15);
  });
  it("reads a straight run as 5 ft a square", () => {
    expect(measureFeet([[0.5, 0.5], [5.5, 0.5]])).toBe(25);
  });
  it("a knight-shaped leg is worth its longer side", () => {
    expect(measureFeet([[0.5, 0.5], [4.5, 1.5]])).toBe(20);
  });
  it("adds the legs of a line bent round a pillar", () => {
    expect(measureFeet([[0.5, 0.5], [4.5, 0.5], [4.5, 3.5]])).toBe(35);
  });
  it("reads 0 ft for a single point", () => {
    expect(measureFeet([[2.5, 2.5]])).toBe(0);
  });
});

describe("snapToSquareMiddle", () => {
  it("lands in the middle of the square the pointer is in, also left of the origin", () => {
    expect(snapToSquareMiddle(2.9, 0.1)).toEqual([2.5, 0.5]);
    expect(snapToSquareMiddle(-0.2, -1.7)).toEqual([-0.5, -1.5]);
  });
});
