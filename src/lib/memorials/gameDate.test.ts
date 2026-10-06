import { describe, expect, it } from "vitest";
import { formatGameDate } from "./gameDate";

const months = [{ num: 1, name: "Hammer" }, { num: 5, name: "Mirtul" }];

describe("formatGameDate", () => {
  it("formats day, month name, year and epoch", () => {
    expect(formatGameDate({ epochName: "DR", months }, 1492, 5, 14)).toBe("14 Mirtul 1492 DR");
  });
  it("omits an empty epoch", () => {
    expect(formatGameDate({ epochName: "", months }, 1492, 1, 2)).toBe("2 Hammer 1492");
  });
  it("omits an unknown month", () => {
    expect(formatGameDate({ epochName: "DR", months }, 1492, 9, 2)).toBe("2 1492 DR");
  });
});
