import { describe, it, expect } from "vitest";
import { resolveTokenArt } from "@/lib/battlemap/tokenArt";

describe("resolveTokenArt", () => {
  it("returns the cutout drawn 'contain' when the entity has one", () => {
    expect(resolveTokenArt({ cutout_url: "https://example.com/owlbear-cutout.webp" })).toEqual({
      tokenUrl: "https://example.com/owlbear-cutout.webp",
      tokenFit: "contain",
    });
  });

  it("returns null when there is no cutout, so callers fall back to the portrait", () => {
    expect(resolveTokenArt({ cutout_url: null })).toBeNull();
  });

  it("treats an empty url as no cutout, so no token is drawn from a blank src", () => {
    expect(resolveTokenArt({ cutout_url: "" })).toBeNull();
  });
});
