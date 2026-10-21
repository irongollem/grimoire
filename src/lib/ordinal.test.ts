import { describe, it, expect } from "vitest";
import { ordinal } from "./ordinal";

describe("ordinal", () => {
  it("uses st/nd/rd/th, with the teens always th", () => {
    expect([1, 2, 3, 4, 9, 10, 11, 12, 13, 21, 22, 23, 101, 111, 112, 113].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "9th", "10th", "11th", "12th", "13th",
      "21st", "22nd", "23rd", "101st", "111th", "112th", "113th",
    ]);
  });
});
