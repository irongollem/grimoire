// sheetPlateUrl.ts routes IllustratedSheet's plates through artUrl (#864/#877)
// so they can move to R2 behind the CDN. artUrl is a no-op with the CDN
// unset or the path unmapped, so the assertion that must never break is:
// with no VITE_ASSET_CDN_URL configured (every test run, and every deploy
// before R2 holds the bytes), a plate must still resolve to exactly the
// glob's own hashed build URL — the same value IllustratedSheet.vue rendered
// before artUrl existed.
import { describe, it, expect } from "vitest";
import { plateGlobKey, resolvePlateUrl } from "./sheetPlateUrl";

const plateModules: Record<string, string> = {
  "/src/assets/sheets/letter/front-gothic.webp": "/assets/gothic-front.abc123.webp",
  "/src/assets/sheets/a4/back-fairy.webp": "/assets/fairy-back.def456.webp",
};

describe("plateGlobKey", () => {
  it("lower-cases the page size to match the glob's on-disk folder", () => {
    expect(plateGlobKey("Letter", "front-gothic.webp")).toBe(
      "/src/assets/sheets/letter/front-gothic.webp",
    );
    expect(plateGlobKey("A4", "back-fairy.webp")).toBe("/src/assets/sheets/a4/back-fairy.webp");
  });
});

describe("resolvePlateUrl", () => {
  it("falls back to the glob's hashed build URL when the CDN is unset", () => {
    expect(resolvePlateUrl("Letter", "front-gothic.webp", plateModules)).toBe(
      "/assets/gothic-front.abc123.webp",
    );
    expect(resolvePlateUrl("A4", "back-fairy.webp", plateModules)).toBe(
      "/assets/fairy-back.def456.webp",
    );
  });

  it("returns undefined, same as a plain lookup, for a plate absent from the glob", () => {
    expect(resolvePlateUrl("Letter", "does-not-exist.webp", plateModules)).toBeUndefined();
  });
});
