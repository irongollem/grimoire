import { describe, expect, it } from "vitest";
import { pageGeometry, pageGeometryCssVars, PRINT_SLACK_PX } from "./pageGeometry";

describe("pageGeometry", () => {
  it("an A5 page's text area is 423px wide, not the 658px A4 galley that broke lines differently", () => {
    expect(pageGeometry("A5", false).contentWidth).toBe(423);
    expect(pageGeometry("A4", false).contentWidth).toBe(658);
  });

  it("a two-column page's column is half the measure less the gap, and text is fitted slack-short", () => {
    const g = pageGeometry("A4", true);
    expect(g.columnWidth).toBe((658 - 24) / 2);
    expect(g.fittedContentHeight).toBe(1123 - 56 - 53 - PRINT_SLACK_PX);
  });

  it("exposes the fitted height and column width under the names the editor CSS reads", () => {
    const vars = pageGeometryCssVars(pageGeometry("Letter", true));
    expect(vars["--sc-content-height"]).toBe("941px");
    expect(vars["--sc-column-width"]).toBe("328px");
  });
});
