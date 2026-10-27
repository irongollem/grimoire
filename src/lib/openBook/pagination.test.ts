import { describe, expect, it } from "vitest";
import {
  clampUnit,
  columnOffset,
  columnPitch,
  countColumns,
  estimatePages,
  folioStarts,
  formatUnit,
  pageOfOffset,
  parseUnit,
  toRoman,
  unitCount,
  unitOfPage,
  unitSlots,
} from "./pagination";

describe("columns", () => {
  it("measures the pitch as page plus gap", () => {
    expect(columnPitch(400, 40)).toBe(440);
    expect(columnOffset(3, 400, 40)).toBe(1320);
    expect(columnOffset(-2, 400, 40)).toBe(0);
  });

  it("counts a single column as one page", () => {
    expect(countColumns(400, 400, 40)).toBe(1);
  });

  it("counts overflow columns, ignoring the missing trailing gap", () => {
    // Three columns: 3 * 400 + 2 * 40.
    expect(countColumns(1280, 400, 40)).toBe(3);
  });

  it("absorbs sub-pixel noise and never answers zero", () => {
    expect(countColumns(840.4, 400, 40)).toBe(2);
    expect(countColumns(0, 400, 40)).toBe(1);
    expect(countColumns(Number.NaN, 400, 40)).toBe(1);
    expect(countColumns(500, 0, 0)).toBe(1);
  });

  it("reads a flow a hair over a column boundary as that many pages, and a real extra column as one more", () => {
    // Two columns are 2 * 440 - 40 = 840 wide. 0.015 of a pitch over is layout noise; 0.03 of a pitch over is a third column.
    expect(countColumns(840 + 0.015 * 440, 400, 40)).toBe(2);
    expect(countColumns(840 + 0.03 * 440, 400, 40)).toBe(3);
  });

  it("puts an element a pixel short of the next column on that next page, and answers page 0 with no width", () => {
    expect(pageOfOffset(439, 400, 40, 3)).toBe(1);
    expect(pageOfOffset(438, 400, 40, 3)).toBe(0);
    expect(pageOfOffset(10, 0, 0, 3)).toBe(0);
  });

  it("finds the page an element sits on", () => {
    expect(pageOfOffset(0, 400, 40, 3)).toBe(0);
    expect(pageOfOffset(445, 400, 40, 3)).toBe(1);
    expect(pageOfOffset(5000, 400, 40, 3)).toBe(2);
  });
});

describe("units", () => {
  it("counts spreads with a frontispiece on the first verso", () => {
    expect(unitCount(1, "spread", true)).toBe(1);
    expect(unitCount(2, "spread", true)).toBe(2);
    expect(unitCount(3, "spread", true)).toBe(2);
    expect(unitCount(4, "spread", true)).toBe(3);
  });

  it("counts a page per unit on a phone", () => {
    expect(unitCount(4, "single", true)).toBe(4);
    expect(unitCount(0, "single", true)).toBe(1);
  });

  it("puts the first page on a recto", () => {
    expect(unitSlots(0, 3, "spread", true)).toEqual({ verso: { kind: "front" }, recto: { kind: "page", k: 0 } });
    expect(unitSlots(1, 3, "spread", true)).toEqual({ verso: { kind: "page", k: 1 }, recto: { kind: "page", k: 2 } });
  });

  it("leaves the recto blank when the last page falls on a verso", () => {
    expect(unitSlots(1, 2, "spread", true)).toEqual({ verso: { kind: "page", k: 1 }, recto: { kind: "blank" } });
  });

  it("shows one page in single mode", () => {
    expect(unitSlots(2, 4, "single", true)).toEqual({ verso: null, recto: { kind: "page", k: 2 } });
    expect(unitSlots(9, 4, "single", true).recto).toEqual({ kind: "blank" });
  });

  it("is blank one past the last page on a phone, and treats a negative or fractional unit as a whole one", () => {
    expect(unitSlots(3, 4, "single", true).recto).toEqual({ kind: "page", k: 3 });
    expect(unitSlots(4, 4, "single", true).recto).toEqual({ kind: "blank" });
    expect(unitSlots(-1, 3, "spread", true)).toEqual(unitSlots(0, 3, "spread", true));
    expect(unitSlots(1.5, 3, "spread", true)).toEqual(unitSlots(1, 3, "spread", true));
  });

  it("finds the unit of a page", () => {
    expect(unitOfPage(0, "spread", true)).toBe(0);
    expect(unitOfPage(1, "spread", true)).toBe(1);
    expect(unitOfPage(2, "spread", true)).toBe(1);
    expect(unitOfPage(3, "spread", true)).toBe(2);
    expect(unitOfPage(3, "single", true)).toBe(3);
  });

  it("clamps into range", () => {
    expect(clampUnit(7, 3)).toBe(2);
    expect(clampUnit(-1, 3)).toBe(0);
    expect(clampUnit(Number.POSITIVE_INFINITY, 3)).toBe(2);
  });
});

describe("the unit in a URL", () => {
  it("parses numbers, end, and rubbish", () => {
    expect(parseUnit("3")).toBe(3);
    expect(parseUnit("end")).toBe(Number.POSITIVE_INFINITY);
    expect(parseUnit(["2", "5"])).toBe(2);
    expect(parseUnit("-1")).toBe(0);
    expect(parseUnit("9999")).toBe(9999);
    expect(parseUnit("12345")).toBe(0);
    expect(parseUnit("x")).toBe(0);
    expect(parseUnit(undefined)).toBe(0);
  });

  it("omits the first unit when writing", () => {
    expect(formatUnit(0)).toBeUndefined();
    expect(formatUnit(2)).toBe("2");
    expect(formatUnit(Number.POSITIVE_INFINITY)).toBe("end");
  });
});

describe("folios", () => {
  it("continues numbering across sections", () => {
    expect(folioStarts([2, 1, 3])).toEqual([1, 3, 4]);
    expect(folioStarts([])).toEqual([]);
    expect(folioStarts([0, 2])).toEqual([1, 2]);
  });

  it("estimates at least one page", () => {
    expect(estimatePages(0)).toBe(1);
    expect(estimatePages(1500)).toBe(1);
    expect(estimatePages(1501)).toBe(2);
    expect(estimatePages(Number.NaN)).toBe(1);
  });

  it("writes roman numerals", () => {
    expect(toRoman(4)).toBe("iv");
    expect(toRoman(9)).toBe("ix");
    expect(toRoman(2024)).toBe("mmxxiv");
    expect(toRoman(0)).toBe("0");
    expect(toRoman(3999)).toBe("mmmcmxcix");
    expect(toRoman(4000)).toBe("4000");
  });
});

describe("a section without a frontispiece", () => {
  it("starts on the verso: the first spread is the first two pages", () => {
    expect(unitSlots(0, 3, "spread", false)).toEqual({ verso: { kind: "page", k: 0 }, recto: { kind: "page", k: 1 } });
    expect(unitSlots(1, 3, "spread", false)).toEqual({ verso: { kind: "page", k: 2 }, recto: { kind: "blank" } });
  });
  it("counts spreads without the title page", () => {
    expect(unitCount(1, "spread", false)).toBe(1);
    expect(unitCount(2, "spread", false)).toBe(1);
    expect(unitCount(3, "spread", false)).toBe(2);
  });
  it("finds the spread of a page", () => {
    expect(unitOfPage(0, "spread", false)).toBe(0);
    expect(unitOfPage(1, "spread", false)).toBe(0);
    expect(unitOfPage(2, "spread", false)).toBe(1);
  });
  it("changes nothing on a phone", () => {
    expect(unitSlots(2, 4, "single", false)).toEqual({ verso: null, recto: { kind: "page", k: 2 } });
    expect(unitCount(4, "single", false)).toBe(4);
  });
});
