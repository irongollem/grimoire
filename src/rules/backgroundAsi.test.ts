import { describe, it, expect } from "vitest";
import {
  abilityBonusesForChoice,
  isValidAsiChoice,
  parseBackgroundAsiChoice,
  parseOriginFeatText,
  resolveOriginFeat,
  trioToSaveKeys,
  withOriginFeat,
  type BackgroundAsiChoice,
} from "@/rules/backgroundAsi";
import type { AbilityScoreKey } from "@/types/background.types";
import type { ClassFeature } from "@/types/feature.types";

const ACOLYTE_TRIO: AbilityScoreKey[] = ["intelligence", "wisdom", "charisma"];

describe("trioToSaveKeys", () => {
  it("maps full ability names to abbreviated SaveKeys", () => {
    expect(trioToSaveKeys(ACOLYTE_TRIO)).toEqual(["int", "wis", "cha"]);
  });

  it("returns an empty array for null/undefined", () => {
    expect(trioToSaveKeys(null)).toEqual([]);
    expect(trioToSaveKeys(undefined)).toEqual([]);
  });
});

describe("isValidAsiChoice", () => {
  it("accepts a well-formed plus2plus1 choice within the trio", () => {
    const choice: BackgroundAsiChoice = { mode: "plus2plus1", primary: "int", secondary: "wis" };
    expect(isValidAsiChoice(choice, ACOLYTE_TRIO)).toBe(true);
  });

  it("rejects plus2plus1 with the same ability picked twice", () => {
    const choice: BackgroundAsiChoice = { mode: "plus2plus1", primary: "int", secondary: "int" };
    expect(isValidAsiChoice(choice, ACOLYTE_TRIO)).toBe(false);
  });

  it("rejects plus2plus1 with an ability outside the trio", () => {
    const choice: BackgroundAsiChoice = { mode: "plus2plus1", primary: "int", secondary: "str" };
    expect(isValidAsiChoice(choice, ACOLYTE_TRIO)).toBe(false);
  });

  it("rejects an incomplete plus2plus1 choice", () => {
    expect(isValidAsiChoice({ mode: "plus2plus1", primary: "int" }, ACOLYTE_TRIO)).toBe(false);
  });

  it("accepts plus1plus1plus1 with no per-ability picks required", () => {
    expect(isValidAsiChoice({ mode: "plus1plus1plus1" }, ACOLYTE_TRIO)).toBe(true);
  });

  it("rejects any choice when the trio is malformed", () => {
    expect(isValidAsiChoice({ mode: "plus1plus1plus1" }, ["intelligence", "wisdom"])).toBe(false);
  });

  it("rejects a null choice", () => {
    expect(isValidAsiChoice(null, ACOLYTE_TRIO)).toBe(false);
  });
});

describe("abilityBonusesForChoice", () => {
  it("splits +2/+1 across the chosen abilities", () => {
    const choice: BackgroundAsiChoice = { mode: "plus2plus1", primary: "cha", secondary: "wis" };
    expect(abilityBonusesForChoice(choice, ACOLYTE_TRIO)).toEqual({ cha: 2, wis: 1 });
  });

  it("gives +1 to all three trio abilities in plus1plus1plus1 mode", () => {
    expect(abilityBonusesForChoice({ mode: "plus1plus1plus1" }, ACOLYTE_TRIO)).toEqual({
      int: 1, wis: 1, cha: 1,
    });
  });

  it("returns no bonuses for an incomplete choice", () => {
    expect(abilityBonusesForChoice({ mode: "plus2plus1", primary: "int" }, ACOLYTE_TRIO)).toEqual({});
  });

  it("returns no bonuses when there is no choice at all", () => {
    expect(abilityBonusesForChoice(null, ACOLYTE_TRIO)).toEqual({});
  });
});

describe("parseBackgroundAsiChoice", () => {
  it("round-trips a valid stored choice", () => {
    const raw = { mode: "plus2plus1", primary: "int", secondary: "wis" };
    expect(parseBackgroundAsiChoice(raw)).toEqual({ mode: "plus2plus1", primary: "int", secondary: "wis" });
  });

  it("rejects an unrecognised mode", () => {
    expect(parseBackgroundAsiChoice({ mode: "plus3" })).toBeNull();
  });

  it("drops an unrecognised ability key rather than trusting it", () => {
    expect(parseBackgroundAsiChoice({ mode: "plus2plus1", primary: "not-an-ability" })).toEqual({
      mode: "plus2plus1", primary: undefined, secondary: undefined,
    });
  });

  it("rejects non-object input", () => {
    expect(parseBackgroundAsiChoice(null)).toBeNull();
    expect(parseBackgroundAsiChoice("plus2plus1")).toBeNull();
    expect(parseBackgroundAsiChoice(undefined)).toBeNull();
  });
});

describe("parseOriginFeatText", () => {
  it("splits a name + parenthetical variant", () => {
    expect(parseOriginFeatText("Magic Initiate (Cleric)")).toEqual({ name: "Magic Initiate", variant: "Cleric" });
  });

  it("returns a bare name with no variant when there are no parens", () => {
    expect(parseOriginFeatText("Alert")).toEqual({ name: "Alert", variant: null });
  });

  it("returns null for empty/whitespace input", () => {
    expect(parseOriginFeatText("")).toBeNull();
    expect(parseOriginFeatText("   ")).toBeNull();
    expect(parseOriginFeatText(null)).toBeNull();
    expect(parseOriginFeatText(undefined)).toBeNull();
  });
});

describe("resolveOriginFeat", () => {
  const magicInitiate: ClassFeature = {
    id: "feat-1", user_id: null, campaign_id: null,
    name: "Magic Initiate", description: null,
    kind: "feat", feat_category: "origin", prerequisites: null, repeatable: true,
    ability_increase: null, mechanics: {},
    source: "srd-2024", prerequisite: null, tags: [], open5e_import: true,
    created_at: "", updated_at: "", conceptual_key: "magic_initiate",
  };

  it("finds the matching feat by conceptual_key", () => {
    const resolved = resolveOriginFeat({ name: "Magic Initiate", variant: "Cleric" }, [magicInitiate], "2024");
    expect(resolved?.feature).toBe(magicInitiate);
    expect(resolved?.originFeat.variant).toBe("Cleric");
  });

  it("returns feature: null (not the whole result) when the feat is not in the books", () => {
    const resolved = resolveOriginFeat({ name: "Alert", variant: null }, [magicInitiate], "2024");
    expect(resolved).not.toBeNull();
    expect(resolved?.feature).toBeNull();
  });

  it("returns null only when there is no origin feat at all", () => {
    expect(resolveOriginFeat(null, [magicInitiate], "2024")).toBeNull();
  });

  it("skips a row of another edition", () => {
    const alert2014: ClassFeature = { ...magicInitiate, id: "a14", name: "Alert", conceptual_key: "alert", ruleset: "2014", feat_category: null };
    const alert2024: ClassFeature = { ...alert2014, id: "a24", ruleset: "2024", feat_category: "origin" };
    expect(resolveOriginFeat({ name: "Alert", variant: null }, [alert2014, alert2024], "2024")?.feature?.id).toBe("a24");
    expect(resolveOriginFeat({ name: "Alert", variant: null }, [alert2014], "2024")?.feature).toBeNull();
  });

  it("skips an official feat of another category and a feature that is not a feat", () => {
    const general: ClassFeature = { ...magicInitiate, id: "g", feat_category: "general" };
    const feature: ClassFeature = { ...magicInitiate, id: "f", kind: "feature" };
    expect(resolveOriginFeat({ name: "Magic Initiate", variant: null }, [general, feature], "2024")?.feature).toBeNull();
  });

  it("accepts a homebrew feat with no category", () => {
    const homebrew: ClassFeature = { ...magicInitiate, id: "h", feat_category: null, ruleset: null };
    expect(resolveOriginFeat({ name: "Magic Initiate", variant: null }, [homebrew], "2024")?.feature?.id).toBe("h");
  });
});

describe("withOriginFeat", () => {
  it("records the id, puts it in feats first and keeps the variant", () => {
    const out = withOriginFeat({ feats: ["levelfeat"] }, { featId: "alert", variant: "Wizard" });
    expect(out).toEqual({ feats: ["alert", "levelfeat"], origin_feat_id: "alert", origin_feat_variant: "Wizard" });
  });

  it("swaps the previous origin feat out and leaves other feats alone", () => {
    const before = { feats: ["alert", "levelfeat"], origin_feat_id: "alert", origin_feat_variant: "Wizard" };
    const out = withOriginFeat(before, { featId: "skilled", variant: null });
    expect(out).toEqual({ feats: ["skilled", "levelfeat"], origin_feat_id: "skilled" });
  });

  it("takes the origin feat back when there is no next one", () => {
    const out = withOriginFeat({ feats: ["alert"], origin_feat_id: "alert", fighting_style: ["x"] }, null);
    expect(out).toEqual({ fighting_style: ["x"] });
  });

  it("removes only the first occurrence of an id also taken at a level", () => {
    const out = withOriginFeat({ feats: ["alert", "alert"], origin_feat_id: "alert" }, null);
    expect(out).toEqual({ feats: ["alert"] });
  });
});
