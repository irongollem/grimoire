import { describe, expect, it } from "vitest";
import {
  subclassExpandedSpellIds, subclassGrantedSpellIds, subclassVariantDue, subclassVariantOptions,
  type SubclassSpellSource,
} from "./subclassSpells";

const land: SubclassSpellSource = {
  granted_spells: { "3": ["a"], "5": ["b"] },
  spell_variants: { Forest: { "3": ["f3"], "5": ["f5"] }, Arctic: { "3": ["a3"] } },
  spell_variant_label: "Land type",
  expanded_spells: { "1": ["e1"], "2": ["e2"] },
  expanded_spell_variants: { Air: { "1": ["air1"], "2": ["air2"] } },
};

describe("subclassGrantedSpellIds", () => {
  it("joins the subclass's list and the chosen option's for that class level", () => {
    expect(subclassGrantedSpellIds(land, 3, "Forest")).toEqual(["a", "f3"]);
    expect(subclassGrantedSpellIds(land, 5, "Forest")).toEqual(["b", "f5"]);
  });
  it("gives only the fixed list with no option, an unknown option or no subclass", () => {
    expect(subclassGrantedSpellIds(land, 3, null)).toEqual(["a"]);
    expect(subclassGrantedSpellIds(land, 3, "Swamp")).toEqual(["a"]);
    expect(subclassGrantedSpellIds(null, 3, null)).toEqual([]);
  });
  it("does not include expanded spells, which are choices", () => {
    expect(subclassGrantedSpellIds(land, 1, "Air")).toEqual([]);
  });
});

describe("subclassExpandedSpellIds", () => {
  it("lists every tier of the own list, plus the chosen option's tiers", () => {
    expect(subclassExpandedSpellIds(land, null)).toEqual(["e1", "e2"]);
    expect(subclassExpandedSpellIds(land, "Air")).toEqual(["e1", "e2", "air1", "air2"]);
    expect(subclassExpandedSpellIds(land, "Swamp")).toEqual(["e1", "e2"]);
    expect(subclassExpandedSpellIds(null, "Air")).toEqual([]);
  });
});

describe("subclassVariantOptions and subclassVariantDue", () => {
  it("is the union of the granted and the expanded options", () => {
    expect(subclassVariantOptions(land)).toEqual(["Forest", "Arctic", "Air"]);
    expect(subclassVariantOptions(null)).toEqual([]);
  });
  it("is due only while the subclass has options and the character holds none", () => {
    expect(subclassVariantDue(land, null)).toBe(true);
    expect(subclassVariantDue(land, "Forest")).toBe(false);
    expect(subclassVariantDue({ ...land, spell_variants: {}, expanded_spell_variants: {} }, null)).toBe(false);
  });
});
