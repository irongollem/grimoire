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

  it("works structurally on a Monster or an Npc without a cast", () => {
    // Both rows name the field `cutout_url`; this exercises the shared
    // reader against each shape rather than a hand-built literal.
    const monster = { id: "m1", name: "Owlbear", cutout_url: "cdn/owlbear.webp" };
    const npc = { id: "n1", name: "Bartender", cutout_url: null };
    expect(resolveTokenArt(monster)?.tokenUrl).toBe("cdn/owlbear.webp");
    expect(resolveTokenArt(npc)).toBeNull();
  });
});
