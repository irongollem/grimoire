import { describe, expect, it } from "vitest";
import { wildShapeRules } from "@/rules/wildshape";
import { evergreenWildShapeRegain } from "@/rules/wildshapeEvergreen";

const rulesAt = (edition: "2014" | "2024", druidLevel: number) =>
  wildShapeRules({ edition, druidLevel, isCircleOfMoon: false, wisMod: 3 });

describe("evergreenWildShapeRegain", () => {
  it("regains one use when none are left at level 20 (2024)", () => {
    expect(evergreenWildShapeRegain(rulesAt("2024", 20), 4)).toBe(3);
  });

  it("does nothing while a use remains", () => {
    expect(evergreenWildShapeRegain(rulesAt("2024", 20), 3)).toBeNull();
    expect(evergreenWildShapeRegain(rulesAt("2024", 20), 0)).toBeNull();
  });

  it("treats an overspent counter as none left", () => {
    expect(evergreenWildShapeRegain(rulesAt("2024", 20), 6)).toBe(3);
  });

  it("does nothing below level 20", () => {
    expect(evergreenWildShapeRegain(rulesAt("2024", 19), 4)).toBeNull();
  });

  it("is a 2024 feature: the 2014 Archdruid has unlimited uses and no Evergreen", () => {
    expect(evergreenWildShapeRegain(rulesAt("2014", 20), 2)).toBeNull();
  });
});
