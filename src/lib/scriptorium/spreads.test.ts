import { describe, it, expect } from "vitest";
import { spreadCount, spreadOfPage, spreadPages } from "./spreads";

describe("spreads", () => {
  it("opens on page 1 alone on the right, then faces pages in pairs", () => {
    expect(spreadPages(0, 10)).toEqual([null, 0]);
    expect(spreadPages(1, 10)).toEqual([1, 2]);
    expect(spreadPages(2, 10)).toEqual([3, 4]);
  });

  it("leaves the right side empty when the last page is a left-hand one", () => {
    expect(spreadPages(5, 10)).toEqual([9, null]);
    expect(spreadCount(10)).toBe(6);
  });

  it("puts every page in the spread that shows it", () => {
    for (let page = 0; page < 11; page++) {
      expect(spreadPages(spreadOfPage(page), 11)).toContain(page);
    }
  });

  it("has no spreads for an empty book", () => {
    expect(spreadCount(0)).toBe(0);
  });
});
