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

  it("finds the page an element sits on", () => {
    expect(pageOfOffset(0, 400, 40, 3)).toBe(0);
    expect(pageOfOffset(445, 400, 40, 3)).toBe(1);
    expect(pageOfOffset(5000, 400, 40, 3)).toBe(2);
  });
});

describe("units", () => {
  it("counts spreads with a frontispiece on the first verso", () => {
    expect(unitCount(1, "spread")).toBe(1);
    expect(unitCount(2, "spread")).toBe(2);
    expect(unitCount(3, "spread")).toBe(2);
    expect(unitCount(4, "spread")).toBe(3);
  });

  it("counts a page per unit on a phone", () => {
    expect(unitCount(4, "single")).toBe(4);
    expect(unitCount(0, "single")).toBe(1);
  });

  it("puts the first page on a recto", () => {
    expect(unitSlots(0, 3, "spread")).toEqual({ verso: { kind: "front" }, recto: { kind: "page", k: 0 } });
    expect(unitSlots(1, 3, "spread")).toEqual({ verso: { kind: "page", k: 1 }, recto: { kind: "page", k: 2 } });
  });

  it("leaves the recto blank when the last page falls on a verso", () => {
    expect(unitSlots(1, 2, "spread")).toEqual({ verso: { kind: "page", k: 1 }, recto: { kind: "blank" } });
  });

  it("shows one page in single mode", () => {
    expect(unitSlots(2, 4, "single")).toEqual({ verso: null, recto: { kind: "page", k: 2 } });
    expect(unitSlots(9, 4, "single").recto).toEqual({ kind: "blank" });
  });

  it("finds the unit of a page", () => {
    expect(unitOfPage(0, "spread")).toBe(0);
    expect(unitOfPage(1, "spread")).toBe(1);
    expect(unitOfPage(2, "spread")).toBe(1);
    expect(unitOfPage(3, "spread")).toBe(2);
    expect(unitOfPage(3, "single")).toBe(3);
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
  });
});
