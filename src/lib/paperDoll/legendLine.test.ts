import { describe, expect, it } from "vitest";
import { legendLine } from "./legendLine";

const container = { left: 100, top: 50, width: 300, height: 240 };
const figure = { left: 180, top: 60, width: 100, height: 200 };

describe("legendLine", () => {
  it("leaves a left-column well from its right edge, at its vertical centre", () => {
    const line = legendLine({
      well: { left: 110, top: 70, width: 60, height: 40 },
      container,
      figure,
      anchor: { x: 50, y: 10 },
      side: "left",
    });
    expect(line).toEqual({ x1: 70, y1: 40, x2: 130, y2: 30 });
  });

  it("leaves a right-column well from its left edge", () => {
    const line = legendLine({
      well: { left: 290, top: 150, width: 60, height: 40 },
      container,
      figure,
      anchor: { x: 100, y: 50 },
      side: "right",
    });
    expect(line).toEqual({ x1: 190, y1: 120, x2: 180, y2: 110 });
  });
});
