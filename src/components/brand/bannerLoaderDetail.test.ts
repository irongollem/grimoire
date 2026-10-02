import { describe, expect, it } from "vitest";
import { bannerLoaderDetail, MAX_STRIPS } from "./bannerLoaderDetail";

describe("bannerLoaderDetail", () => {
  it("keeps the loading screen's cut at the loading screen's size", () => {
    expect(bannerLoaderDetail(104)).toEqual({ strips: MAX_STRIPS, sway: 0.1 });
  });

  it("cuts a button-sized flag into few strips and sways it further", () => {
    const { strips, sway } = bannerLoaderDetail(16);
    expect(strips).toBe(8);
    // 16px tall is under 7px wide: a tenth of that would not read as motion.
    expect(sway).toBeGreaterThan(0.2);
    expect(sway).toBeLessThanOrEqual(0.3);
  });

  it("never cuts finer than the full flag, however large", () => {
    expect(bannerLoaderDetail(400)).toEqual({ strips: MAX_STRIPS, sway: 0.1 });
  });

  it("scales the cut between the two", () => {
    const small = bannerLoaderDetail(32).strips;
    const medium = bannerLoaderDetail(56).strips;
    expect(small).toBeGreaterThan(8);
    expect(medium).toBeGreaterThan(small);
    expect(medium).toBeLessThan(MAX_STRIPS);
  });

  it("falls back to the full cut when the box cannot be measured", () => {
    // jsdom, or a flag mounted inside a hidden parent, reports a height of 0.
    expect(bannerLoaderDetail(0)).toEqual({ strips: MAX_STRIPS, sway: 0.1 });
    expect(bannerLoaderDetail(Number.NaN)).toEqual({ strips: MAX_STRIPS, sway: 0.1 });
  });
});
