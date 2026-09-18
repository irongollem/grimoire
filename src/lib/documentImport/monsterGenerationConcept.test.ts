import { describe, expect, it } from "vitest";
import { monsterGenerationConcept, monsterGenerationCreditCost, monsterGenerationOptionsFromPage } from "./monsterGenerationConcept";

describe("monsterGenerationConcept", () => {
  it("degrades to a bare name when nothing else was extracted", () => {
    expect(monsterGenerationConcept({ name: "Grallak Kur" })).toBe("Grallak Kur");
  });

  it("falls back to a generic lead when even the name is missing", () => {
    expect(monsterGenerationConcept({})).toBe("An unnamed creature");
  });

  it("combines size and type into one clause", () => {
    expect(monsterGenerationConcept({ name: "Grell", size: "Large", monster_type: "aberration" })).toBe(
      "Grell, a Large aberration",
    );
  });

  it("uses a size or type alone when only one is present", () => {
    expect(monsterGenerationConcept({ size: "Large" })).toBe("A Large creature");
    expect(monsterGenerationConcept({ monster_type: "fiend" })).toBe("A fiend creature");
  });

  it("appends alignment, habitat and challenge rating as trailing clauses", () => {
    const concept = monsterGenerationConcept({
      name: "Grell",
      alignment: "chaotic evil",
      habitat: "the Underdark",
      stat_block: { challenge_rating: "5" },
    });
    expect(concept).toBe("Grell (chaotic evil), found in the Underdark, roughly challenge rating 5");
  });

  it("appends the description last, after every other clause", () => {
    const concept = monsterGenerationConcept({
      name: "Grell",
      habitat: "the Underdark",
      description: "A floating, tentacled horror that hunts by touch alone.",
    });
    expect(concept).toBe("Grell, found in the Underdark. A floating, tentacled horror that hunts by touch alone.");
  });

  it("ignores a stat_block that isn't a plain object", () => {
    expect(monsterGenerationConcept({ name: "Grell", stat_block: "see appendix" })).toBe("Grell");
  });

  it("ignores blank strings the same as absent fields", () => {
    expect(monsterGenerationConcept({ name: "Grell", habitat: "   ", description: "" })).toBe("Grell");
  });
});

describe("monsterGenerationOptionsFromPage", () => {
  it("returns an empty object when nothing on the page matches", () => {
    expect(monsterGenerationOptionsFromPage({ name: "Grell" })).toEqual({});
  });

  it("forwards a challenge rating from the stat block as-is", () => {
    expect(monsterGenerationOptionsFromPage({ stat_block: { challenge_rating: "1/2" } })).toEqual({
      challenge_rating: "1/2",
    });
  });

  it("resolves a monster_type printed with extra words to its enum member", () => {
    expect(monsterGenerationOptionsFromPage({ monster_type: "Large fiend (demon)" })).toEqual({
      monster_type: "fiend",
    });
  });

  it("resolves a size printed with extra words to its enum member", () => {
    expect(monsterGenerationOptionsFromPage({ size: "Large (roughly ogre-sized)" })).toEqual({ size: "large" });
  });

  it("omits monster_type when nothing in the candidate list matches", () => {
    expect(monsterGenerationOptionsFromPage({ monster_type: "a walled city" })).toEqual({});
  });

  it("prefers the longer of two nested enum matches, same rule as resolveEnum", () => {
    // "very rare" analogue for monster types isn't real 5e vocabulary, but
    // sizes have the same nesting risk if a future value overlaps — this
    // pins the longest-match rule against the size list directly.
    expect(monsterGenerationOptionsFromPage({ size: "gargantuan" })).toEqual({ size: "gargantuan" });
  });

  it("combines a valid challenge rating with a valid type and size", () => {
    expect(
      monsterGenerationOptionsFromPage({
        monster_type: "undead",
        size: "medium",
        stat_block: { challenge_rating: "3" },
      }),
    ).toEqual({ challenge_rating: "3", monster_type: "undead", size: "medium" });
  });
});

describe("monsterGenerationCreditCost", () => {
  it("multiplies the base cost by the provider multiplier and rounds to two places", () => {
    expect(monsterGenerationCreditCost(1, 1.5)).toBe(1.5);
    expect(monsterGenerationCreditCost(0.333, 1)).toBe(0.33);
  });

  it("is a no-op at a 1x multiplier", () => {
    expect(monsterGenerationCreditCost(2, 1)).toBe(2);
  });
});
