import { describe, expect, it } from "vitest";
import { scaledBoxSize } from "./useScriptoriumZoom";

describe("scaledBoxSize", () => {
  it("sizes the scroll box to the scaled book, so a zoomed-out book leaves no blank scroll space", () => {
    expect(scaledBoxSize({ w: 816, h: 10000 }, 0.5)).toEqual({ width: 408, height: 5000 });
  });
  it("grows past the content when zoomed in, so the scroll area reaches the whole scaled book", () => {
    expect(scaledBoxSize({ w: 816, h: 1056 }, 1.5)).toEqual({ width: 1224, height: 1584 });
  });
  it("rounds up so a fractional edge is never clipped", () => {
    expect(scaledBoxSize({ w: 101, h: 101 }, 0.5)).toEqual({ width: 51, height: 51 });
  });
});
