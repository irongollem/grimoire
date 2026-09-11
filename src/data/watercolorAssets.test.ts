// watercolorSrc() is routed through artUrl() (#864/#877) so the watercolor
// decoration art can move to R2 behind the CDN. artUrl is a no-op with the
// CDN unset or the path unmapped, so this pins the one thing that must never
// change: with no VITE_ASSET_CDN_URL configured (every test run, and every
// deploy before R2 holds the bytes), watercolorSrc must resolve to exactly
// the same local path it did before artUrl existed.
import { describe, it, expect } from "vitest";
import { WATERCOLOR_ASSETS, WATERCOLOR_COUNT, watercolorAsset, watercolorSrc } from "./watercolorAssets";

describe("watercolorSrc", () => {
  it("resolves every variant unchanged when the CDN is unset", () => {
    for (let variant = 1; variant <= WATERCOLOR_COUNT; variant++) {
      expect(watercolorSrc(variant)).toBe(
        `/assets/scriptorium/watercolor/${WATERCOLOR_ASSETS[variant - 1].file}`,
      );
    }
  });

  it("clamps out-of-range variants the same way watercolorAsset does", () => {
    expect(watercolorSrc(0)).toBe(`/assets/scriptorium/watercolor/${watercolorAsset(1).file}`);
    expect(watercolorSrc(999)).toBe(
      `/assets/scriptorium/watercolor/${watercolorAsset(WATERCOLOR_COUNT).file}`,
    );
  });
});
