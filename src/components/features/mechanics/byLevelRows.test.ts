import { describe, expect, it } from "vitest";
import { nextLevel, numbersFromStrings, recordFromRows, rowsFromRecord, stringsFromNumbers } from "./byLevelRows";

describe("byLevelRows", () => {
  it("orders rows by level numerically", () => {
    expect(rowsFromRecord({ "10": "b", "2": "a" }).map((r) => r.level)).toEqual(["2", "10"]);
  });

  it("keeps only complete rows with a level from 1 to 20, the first at each level", () => {
    const rows = [
      { level: "3", value: "1d6" },
      { level: "3", value: "dup" },
      { level: "", value: "x" },
      { level: "21", value: "x" },
      { level: "4", value: " " },
      { level: "1.5", value: "x" },
    ];
    expect(recordFromRows(rows)).toEqual({ "3": "1d6" });
  });

  // PHB 2014: a character is level 1 to 20; both ends are valid, 0 and 21 are not.
  it("accepts the first and the last character level and rejects the ones either side", () => {
    expect(recordFromRows([{ level: "0", value: "x" }, { level: "1", value: "a" }, { level: "20", value: "b" }, { level: "21", value: "c" }])).toEqual({
      "1": "a",
      "20": "b",
    });
  });

  it("converts numbers both ways and drops what is not a whole number", () => {
    expect(stringsFromNumbers({ "1": 2 })).toEqual({ "1": "2" });
    expect(numbersFromStrings({ "1": "2", "2": "x", "3": "1.5" })).toEqual({ "1": 2 });
  });

  it("offers the level after the highest, capped at 20", () => {
    expect(nextLevel([])).toBe("1");
    expect(nextLevel([{ level: "5", value: "" }])).toBe("6");
    expect(nextLevel([{ level: "20", value: "" }])).toBe("20");
  });
});
