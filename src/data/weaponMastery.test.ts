import { describe, expect, it } from "vitest";
import { WEAPON_MASTERY_PROPERTIES } from "@/types/item.types";
import { WEAPON_MASTERY_DEFINITIONS, WEAPON_MASTERY_LIST } from "./weaponMastery";

describe("WEAPON_MASTERY_DEFINITIONS", () => {
  it("has exactly one definition per mastery property, with non-empty label and description", () => {
    for (const key of WEAPON_MASTERY_PROPERTIES) {
      const def = WEAPON_MASTERY_DEFINITIONS[key];
      expect(def, `missing definition for "${key}"`).toBeDefined();
      expect(def.label.trim().length).toBeGreaterThan(0);
      expect(def.description.trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(WEAPON_MASTERY_DEFINITIONS).sort()).toEqual([...WEAPON_MASTERY_PROPERTIES].sort());
  });
});

describe("WEAPON_MASTERY_LIST", () => {
  it("mirrors WEAPON_MASTERY_PROPERTIES in the same order", () => {
    expect(WEAPON_MASTERY_LIST.map((e) => e.key)).toEqual([...WEAPON_MASTERY_PROPERTIES]);
  });
});
