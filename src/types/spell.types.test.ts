import { describe, expect, it } from "vitest";
import {
  getDefaultSpellSlots,
  getMulticlassSpellSlots,
  multiclassCasterLevel,
} from "./spell.types";

describe("edition-aware spell-slot progression", () => {
  it("keeps 2014 as the default multiclass rounding policy", () => {
    const classes = [
      { class_name: "Ranger", levels: 3 },
      { class_name: "Wizard", levels: 1 },
    ];
    expect(multiclassCasterLevel(classes)).toBe(2);
    expect(getMulticlassSpellSlots(classes)).toEqual([
      { level: 1, max: 3, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
  });

  it("rounds Paladin and Ranger levels up under the 2024 multiclass rules", () => {
    const classes = [
      { class_name: "Ranger", levels: 3 },
      { class_name: "Wizard", levels: 1 },
    ];
    expect(multiclassCasterLevel(classes, "2024")).toBe(3);
    expect(getMulticlassSpellSlots(classes, "2024")).toEqual([
      { level: 1, max: 4, used: 0, pool: "spellcasting", recovery: "long" },
      { level: 2, max: 2, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
  });

  it("does not grant a single-class Artificer level-2 slots before level 5", () => {
    expect(getDefaultSpellSlots("Artificer", 3)).toEqual([
      { level: 1, max: 3, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
    expect(getDefaultSpellSlots("Artificer", 5)).toEqual([
      { level: 1, max: 4, used: 0, pool: "spellcasting", recovery: "long" },
      { level: 2, max: 2, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
  });

  it("gives revised Paladins and Rangers spellcasting at level 1", () => {
    expect(getDefaultSpellSlots("Paladin", 1, "2014")).toEqual([]);
    expect(getDefaultSpellSlots("Paladin", 1, "2024")).toEqual([
      { level: 1, max: 2, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
    expect(getDefaultSpellSlots("Ranger", 1, "2024")).toEqual([
      { level: 1, max: 2, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
  });
});
