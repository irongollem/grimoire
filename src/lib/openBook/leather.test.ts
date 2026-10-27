import { describe, expect, it } from "vitest";
import { OPEN_BOOK_LEATHERS } from "@/types/openBook.types";
import { LEATHERS, leatherBackground, leatherGrain, leatherStyle } from "./leather";

describe("leather", () => {
  it("tints sea, night and ash and leaves oxblood and walnut natural", () => {
    expect(OPEN_BOOK_LEATHERS.filter((id) => leatherGrain(id) === "tinted")).toEqual(["sea", "night", "ash"]);
    expect(LEATHERS.walnut.blend).toBe("normal");
  });

  it("gives swatches a fine grain by default and lets a caller choose", () => {
    expect(leatherBackground("sea").backgroundSize).toBe("11rem 11rem");
    expect(leatherBackground("sea", "6rem").backgroundSize).toBe("6rem 6rem");
    expect(leatherBackground("sea").backgroundBlendMode).toBe("luminosity");
    // A swatch and the reader's cover are painted from the same hide.
    expect(leatherBackground("night").backgroundColor).toBe(leatherStyle("night")["--ob-hide"]);
  });

  it("exposes the reader's variables", () => {
    expect(leatherStyle("night")["--ob-hide"]).toBe("#1f3a66");
    expect(leatherStyle("night")["--ob-leather-url"]).toMatch(/^url\(".*leather/);
  });
});
