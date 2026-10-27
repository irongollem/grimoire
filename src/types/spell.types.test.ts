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
    expect(multiclassCasterLevel(classes, "2014")).toBe(2);
    expect(getMulticlassSpellSlots(classes, "2014")).toEqual([
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
    expect(getDefaultSpellSlots("Artificer", 3, "2014")).toEqual([
      { level: 1, max: 3, used: 0, pool: "spellcasting", recovery: "long" },
    ]);
    expect(getDefaultSpellSlots("Artificer", 5, "2014")).toEqual([
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

// PHB 2014 "Multiclassing: Spellcasting": add all levels of bard, cleric, druid, sorcerer and wizard, half
// (rounded down) of paladin and ranger, a third (rounded down) of Eldritch Knight and Arcane Trickster. TCE
// "Artificer: Multiclassing" rounds the Artificer's half up. The table stops at character level 20.
describe("multiclass caster level by the book", () => {
  const slotMaxima = (classes: Parameters<typeof getMulticlassSpellSlots>[0]) =>
    getMulticlassSpellSlots(classes, "2014")
      .filter((slot) => slot.pool === "spellcasting")
      .map((slot) => slot.max);

  it("rounds an Artificer's half up: Artificer 3 + Wizard 1 is caster level 3", () => {
    const classes = [{ class_name: "Artificer", levels: 3 }, { class_name: "Wizard", levels: 1 }];
    expect(multiclassCasterLevel(classes, "2014")).toBe(3);
    expect(slotMaxima(classes)).toEqual([4, 2]);
  });

  it("rounds a subclass third down: Eldritch Knight 7 + Wizard 1 is caster level 3", () => {
    const classes = [{ class_name: "Fighter", levels: 7, category: "third" as const }, { class_name: "Wizard", levels: 1 }];
    expect(multiclassCasterLevel(classes, "2014")).toBe(3);
  });

  it("stops at caster level 20 rather than reading past the slot table", () => {
    const classes = [{ class_name: "Wizard", levels: 15 }, { class_name: "Cleric", levels: 10 }];
    expect(multiclassCasterLevel(classes, "2014")).toBe(20);
    expect(slotMaxima(classes)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it("gives a caster level of 1 its two first-level slots", () => {
    const classes = [{ class_name: "Wizard", levels: 1 }, { class_name: "Barbarian", levels: 4 }];
    expect(slotMaxima(classes)).toEqual([2]);
  });
});

