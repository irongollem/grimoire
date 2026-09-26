import { describe, it, expect } from "vitest";
import { GEMINI_ASPECT_RATIOS, isValidGeminiAspectRatio, nearestGeminiAspect } from "./geminiAspect.ts";

describe("nearestGeminiAspect", () => {
  it("picks the exact bucket for an already-supported ratio", () => {
    expect(nearestGeminiAspect(1600, 900).label).toBe("16:9");
    expect(nearestGeminiAspect(900, 1600).label).toBe("9:16");
    expect(nearestGeminiAspect(1024, 1024).label).toBe("1:1");
  });

  it("compares distance in log space, not plain linear difference", () => {
    // 2.045 sits between 16:9 (1.778) and 21:9 (2.333). Linearly it's
    // closer to 16:9 (|2.045-1.778|=0.267 vs |2.045-2.333|=0.288), but the
    // log-space metric this function uses puts it closer to 21:9
    // (ln(2.045/1.778)=0.140 vs ln(2.045/2.333)=0.132).
    expect(nearestGeminiAspect(2045, 1000).label).toBe("21:9");
  });

  it("falls back to 1:1 for a degenerate zero dimension", () => {
    expect(nearestGeminiAspect(0, 0).label).toBe("1:1");
  });
});

describe("isValidGeminiAspectRatio", () => {
  it("accepts every exact bucket", () => {
    for (const { ratio } of GEMINI_ASPECT_RATIOS) {
      // A representative width/height pair at this exact ratio.
      const height = 1000;
      const width = Math.round(height * ratio);
      expect(isValidGeminiAspectRatio(width, height)).toBe(true);
    }
  });

  it("accepts the small drift the client's own multiple-of-16 rounding introduces", () => {
    // 16:9 target is 1.77778; rounding each edge down to 16 independently
    // can shift this by a few pixels without changing which bucket it's
    // closest to — 2560x1440 is the exact bucket, 2544x1440 (one 16px step
    // narrower) is still unmistakably 16:9.
    expect(isValidGeminiAspectRatio(2544, 1440)).toBe(true);
  });

  it("rejects an aspect that was never padded to any Gemini bucket", () => {
    // 1.12:1 sits almost exactly at the log-space midpoint between 1:1 (1.0)
    // and 5:4 (1.25) — about 0.11 from each, well past the 0.05 tolerance,
    // unlike genuine rounding drift off a real bucket.
    expect(isValidGeminiAspectRatio(1120, 1000)).toBe(false);
  });

  it("rejects non-integer or non-positive input", () => {
    expect(isValidGeminiAspectRatio(1024.5, 1024)).toBe(false);
    expect(isValidGeminiAspectRatio(0, 1024)).toBe(false);
    expect(isValidGeminiAspectRatio(-1024, 1024)).toBe(false);
  });
});
