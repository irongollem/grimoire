import { describe, expect, it } from "vitest";
import { backgroundInsertFromAi, sanitizeAbilityTrio, sanitizeSkills } from "./backgroundAi";

const raw = {
  name: "Lamplighter",
  description: "You kept the lamps lit.",
  skill_proficiencies: ["insight", "Sleight of Hand", "Basket Weaving", "Stealth"],
  tool_proficiencies: ["Thieves' Tools", "Smith's Tools", "Nonsense"],
  languages: ["Elvish", "Klingon", "Dwarvish", "Gnomish"],
  equipment: "A lantern.\n\nTen gold.",
  feature_name: "Night Rounds",
  feature_description: "You know the alleys.",
  feat_grant_name: "Magic Initiate (Cleric)",
  feat_grant_description: "Two cantrips.",
  asi_ability_trio: ["Wisdom", "dexterity", "charisma"],
  suggested_characteristics: "Trait.",
  tags: ["City", "city"],
};

describe("backgroundInsertFromAi", () => {
  it("shapes a 2014 background: feature yes, feat and trio no", () => {
    const b = backgroundInsertFromAi(raw, { ruleset: "2014" });
    expect(b.skill_proficiencies).toEqual(["Insight", "Sleight of Hand"]);
    expect(b.feature_name).toBe("Night Rounds");
    expect(b.feature_description).not.toBeNull();
    expect(b.feat_grant_name).toBeNull();
    expect(b.feat_grant_description).toBeNull();
    expect(b.origin_feat).toBeNull();
    expect(b.asi_ability_trio).toBeNull();
    // Two proficiencies between tools and languages, never more.
    expect(b.tool_proficiencies).toEqual(["Thieves' Tools", "Smith's Tools"]);
    expect(b.languages).toEqual([]);
    expect(b.source).toBe("Grimoire:AI");
    expect(b.ruleset).toBe("2014");
    expect(b.tags).toEqual(["city"]);
  });

  it("shapes a 2024 background: feat, trio and one tool, no feature", () => {
    const b = backgroundInsertFromAi(raw, { ruleset: "2024" });
    expect(b.feature_name).toBeNull();
    expect(b.feature_description).toBeNull();
    expect(b.feat_grant_name).toBe("Magic Initiate (Cleric)");
    expect(b.origin_feat).toEqual({ name: "Magic Initiate", variant: "Cleric" });
    expect(b.asi_ability_trio).toEqual(["wisdom", "dexterity", "charisma"]);
    expect(b.tool_proficiencies).toEqual(["Thieves' Tools"]);
    expect(b.languages).toEqual([]);
  });

  it("gives a 2014 background with one tool a language for its second proficiency", () => {
    const b = backgroundInsertFromAi(
      { ...raw, tool_proficiencies: ["Thieves' Tools"] },
      { ruleset: "2014" },
    );
    expect(b.tool_proficiencies).toEqual(["Thieves' Tools"]);
    expect(b.languages).toEqual(["Elvish"]);
  });

  it("returns empty collections for junk", () => {
    const b = backgroundInsertFromAi({ name: "X" }, { ruleset: "2024" });
    expect(b.skill_proficiencies).toEqual([]);
    expect(b.asi_ability_trio).toBeNull();
    expect(b.description).toBeNull();
  });
});

describe("sanitizers", () => {
  it("requires exactly three distinct abilities", () => {
    expect(sanitizeAbilityTrio(["strength", "strength", "wisdom"])).toBeNull();
    expect(sanitizeAbilityTrio(["strength", "wisdom"])).toBeNull();
    expect(sanitizeAbilityTrio(["a", "b", "c"])).toBeNull();
    expect(sanitizeAbilityTrio(["strength", "wisdom", "charisma", "dexterity"])).toBeNull();
    expect(sanitizeAbilityTrio("strength")).toBeNull();
  });
  it("caps skills at two", () => {
    expect(sanitizeSkills(["arcana", "history", "religion"])).toEqual(["Arcana", "History"]);
  });
});
