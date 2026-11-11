import { describe, expect, it } from "vitest";
import { MAX_FIT_SCALE, parseZoomChoice, stepZoom, zoomAnchorPoint, zoomPercent, zoomScale, zoomScrollDelta } from "./zoom";

describe("zoomScale", () => {
  it("fills a wide space past 100%, but never past the largest step", () => {
    expect(zoomScale("fit", 1200, 800)).toBe(1.5);
    expect(zoomScale("fit", 4000, 800)).toBe(MAX_FIT_SCALE);
  });
  it("shrinks to a narrow space", () => {
    expect(zoomScale("fit", 400, 800)).toBe(0.5);
  });
  it("draws a fixed percentage at that size whatever the space is", () => {
    expect(zoomScale(150, 300, 800)).toBe(1.5);
  });
  it("does not divide by an unmeasured space", () => {
    expect(zoomScale("fit", 0, 800)).toBe(1);
  });
});

describe("stepZoom", () => {
  it("walks 50, 75, 100, 125, 150, 200 and stops at the ends", () => {
    expect(stepZoom(50, 1)).toBe(75);
    expect(stepZoom(100, 1)).toBe(125);
    expect(stepZoom(150, 1)).toBe(200);
    expect(stepZoom(200, 1)).toBe(200);
    expect(stepZoom(100, -1)).toBe(75);
    expect(stepZoom(50, -1)).toBe(50);
  });
  it("steps from the fitted size, not from a step that was never chosen", () => {
    expect(stepZoom(88, 1)).toBe(100);
    expect(stepZoom(88, -1)).toBe(75);
  });
});

describe("zoom choice", () => {
  it("falls back to fit for a value that is not a step", () => {
    expect(parseZoomChoice("90")).toBe("fit");
    expect(parseZoomChoice("junk")).toBe("fit");
    expect(parseZoomChoice("125")).toBe(125);
  });
  it("reports the fitted size as a rounded percent", () => {
    expect(zoomPercent("fit", 0.876)).toBe(88);
    expect(zoomPercent(150, 1.5)).toBe(150);
  });
});

describe("zoom keeps the spot in view", () => {
  it("doubling the scale scrolls so the spot under the eye stays put", () => {
    // Page edge drawn at 100, the spot at 400 on screen, scale 1 -> 2.
    const point = zoomAnchorPoint(400, 100, 1);
    expect(point).toBe(300);
    // The page edge has not moved yet (same scroll), so the spot is now 300 px further down.
    expect(zoomScrollDelta(point, 100, 2, 400)).toBe(300);
  });
  it("a page scrolled far down (its edge well above the view) keeps that far page, not the top", () => {
    // Page 12 in view: the sheet starts 9000 px above the pane. Halving the scale scrolls back up by half the distance.
    const point = zoomAnchorPoint(300, -9000, 1);
    expect(zoomScrollDelta(point, -9000, 0.5, 300)).toBe(-4650);
  });
});
