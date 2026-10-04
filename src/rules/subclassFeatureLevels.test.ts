import { describe, expect, it } from "vitest";
import { publishedSubclassFeatureLevels } from "./subclassFeatureLevels";

describe("publishedSubclassFeatureLevels", () => {
  it("keeps each 2014 class's own cadence", () => {
    expect(publishedSubclassFeatureLevels("Rogue", "2014")).toEqual([3, 9, 13, 17]);
    expect(publishedSubclassFeatureLevels("Wizard", "2014")).toEqual([2, 6, 10, 14]);
    expect(publishedSubclassFeatureLevels("Warlock", "2014")).toEqual([1, 6, 10, 14]);
  });

  it("starts every 2024 subclass at level 3", () => {
    for (const name of ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]) {
      expect(publishedSubclassFeatureLevels(name, "2024")?.[0]).toBe(3);
    }
  });

  it("matches names case-insensitively and knows nothing of homebrew", () => {
    expect(publishedSubclassFeatureLevels("  fighter ", "2024")).toEqual([3, 7, 10, 15, 18]);
    expect(publishedSubclassFeatureLevels("Gunslinger", "2014")).toBeNull();
  });
});
