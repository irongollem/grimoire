import { describe, it, expect } from "vitest";
import { normalizeAiItemMastery } from "./itemMastery";

describe("normalizeAiItemMastery", () => {
  it("accepts a valid mastery value for a 2024 weapon", () => {
    expect(normalizeAiItemMastery("cleave", { ruleset: "2024", itemType: "weapon" })).toBe("cleave");
  });

  it("normalizes case", () => {
    expect(normalizeAiItemMastery("Vex", { ruleset: "2024", itemType: "weapon" })).toBe("vex");
    expect(normalizeAiItemMastery("TOPPLE", { ruleset: "2024", itemType: "weapon" })).toBe("topple");
  });

  it("rejects junk/invalid values", () => {
    expect(normalizeAiItemMastery("smash", { ruleset: "2024", itemType: "weapon" })).toBeNull();
    expect(normalizeAiItemMastery("", { ruleset: "2024", itemType: "weapon" })).toBeNull();
    expect(normalizeAiItemMastery(null, { ruleset: "2024", itemType: "weapon" })).toBeNull();
    expect(normalizeAiItemMastery(undefined, { ruleset: "2024", itemType: "weapon" })).toBeNull();
  });

  it("strips mastery for non-2024 campaigns", () => {
    expect(normalizeAiItemMastery("cleave", { ruleset: "2014", itemType: "weapon" })).toBeNull();
  });

  it("strips mastery for non-weapon items", () => {
    expect(normalizeAiItemMastery("cleave", { ruleset: "2024", itemType: "armor" })).toBeNull();
    expect(normalizeAiItemMastery("cleave", { ruleset: "2024", itemType: "wondrous_item" })).toBeNull();
  });
});
