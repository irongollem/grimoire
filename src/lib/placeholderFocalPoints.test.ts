// placeholderUrl() routes every placeholder-art call site through artUrl()
// (#864/#877) so placeholder art can move to R2 behind the CDN. artUrl is a
// no-op with the CDN unset or the path unmapped, so this pins the one thing
// that must never change: with no VITE_ASSET_CDN_URL configured (every test
// run, and every deploy before R2 holds the bytes), placeholderUrl must
// resolve to exactly the same local path every call site hard-coded before.
import { describe, it, expect } from "vitest";
import { getPlaceholderFocalPoint, placeholderUrl, updatePlaceholderFocalPointCache } from "./placeholderFocalPoints";

describe("placeholderUrl", () => {
  it("resolves an entity type to its local placeholder path when the CDN is unset", () => {
    expect(placeholderUrl("npc")).toBe("/assets/placeholders/npc.webp");
    expect(placeholderUrl("dungeonfeature")).toBe("/assets/placeholders/dungeonfeature.webp");
  });

  it("produces the exact filename shape FocalImage.vue's entityTypeFromPlaceholder parses back", () => {
    // /assets/placeholders/<entityType>.webp — see FocalImage.vue.
    expect(placeholderUrl("monster")).toMatch(/\/assets\/placeholders\/monster\.webp$/);
  });
});

describe("getPlaceholderFocalPoint / updatePlaceholderFocalPointCache", () => {
  it("returns null for an entity type with no cached focal point", () => {
    expect(getPlaceholderFocalPoint("does-not-exist")).toBeNull();
  });

  it("returns what was just written to the cache", () => {
    updatePlaceholderFocalPointCache("npc", { x: 40, y: 60 });
    expect(getPlaceholderFocalPoint("npc")).toEqual({ x: 40, y: 60 });
  });
});
