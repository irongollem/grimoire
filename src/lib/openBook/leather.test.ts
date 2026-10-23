import { describe, expect, it } from "vitest";
import { OPEN_BOOK_LEATHERS } from "@/types/openBook.types";
import { LEATHERS, leatherBackground, leatherGrain, leatherStyle } from "./leather";

describe("leather", () => {
  it("defines every leather", () => {
    for (const id of OPEN_BOOK_LEATHERS) {
      expect(LEATHERS[id].label).not.toBe("");
      expect(LEATHERS[id].textureUrl).toContain("/assets/open-book/leather");
    }
  });

  it("uses the oxblood photograph for oxblood and the brown grain for the rest", () => {
    expect(LEATHERS.oxblood.textureUrl).toContain("leather-oxblood");
    expect(LEATHERS.sea.textureUrl).not.toContain("oxblood");
  });

  it("tints sea, night and ash and leaves oxblood and walnut natural", () => {
    expect(OPEN_BOOK_LEATHERS.filter((id) => leatherGrain(id) === "tinted")).toEqual(["sea", "night", "ash"]);
    expect(LEATHERS.walnut.blend).toBe("normal");
  });

  it("gives swatches a fine grain by default and lets a caller choose", () => {
    expect(leatherBackground("sea").backgroundSize).toBe("11rem 11rem");
    expect(leatherBackground("sea", "6rem").backgroundSize).toBe("6rem 6rem");
    expect(leatherBackground("sea").backgroundBlendMode).toBe("luminosity");
  });

  it("exposes the reader's variables", () => {
    expect(leatherStyle("night")["--ob-hide"]).toBe("#1f3a66");
    expect(leatherStyle("night")["--ob-leather-url"]).toMatch(/^url\(".*leather/);
  });
});
