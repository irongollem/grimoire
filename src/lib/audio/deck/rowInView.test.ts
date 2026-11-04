import { describe, expect, it } from "vitest";
import { firstRowInView } from "./rowInView";

// Four rows of 50px pads on a 60px pitch, scrolled by `by`.
const rows = (by: number) => [0, 1, 2, 3].map((i) => ({ top: i * 60 - by, bottom: i * 60 - by + 50 }));

describe("firstRowInView", () => {
  it("is the top row when nothing is scrolled", () => {
    expect(firstRowInView(rows(0), 0)).toBe(0);
  });

  it("hands over to the next row once the top one is more than half gone", () => {
    // Row 0 shows 30 of its 50px: still in view.
    expect(firstRowInView(rows(20), 0)).toBe(0);
    // Row 0 shows 20px, less than half: row 1 is the row in view.
    expect(firstRowInView(rows(30), 0)).toBe(1);
  });

  it("counts from below the lane headers, not from the top of the scroller", () => {
    // Unscrolled, but 30px of header covers more than half of row 0.
    expect(firstRowInView(rows(0), 30)).toBe(1);
  });

  it("is the last row when every row is above the view, and 0 when there are none", () => {
    expect(firstRowInView(rows(500), 0)).toBe(3);
    expect(firstRowInView([], 0)).toBe(0);
  });
});
