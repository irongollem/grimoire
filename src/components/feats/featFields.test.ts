import { describe, expect, it } from "vitest";
import { numberOrNothing, validateFeatFields, withAbilityScore, type FeatFormFields } from "./featFields";

const none: FeatFormFields = { feat_category: null, prerequisites: null, repeatable: false, ability_increase: null };

describe("validateFeatFields", () => {
  it("accepts a feat with nothing set", () => {
    expect(validateFeatFields(none)).toEqual({ parsed: none, errors: [] });
  });

  it("accepts complete prerequisites and an increase", () => {
    const fields: FeatFormFields = {
      feat_category: "general",
      prerequisites: { level: 4, abilities: { any_of: { str: 13 } } },
      repeatable: true,
      ability_increase: { abilities: ["str", "dex"], amount: 1, split: false, max: 20 },
    };
    expect(validateFeatFields(fields).errors).toEqual([]);
  });

  it("flags prerequisites with nothing in them and an out-of-range score", () => {
    expect(validateFeatFields({ ...none, prerequisites: {} }).errors).toHaveLength(1);
    expect(validateFeatFields({ ...none, prerequisites: { level: 99 } }).errors).toHaveLength(1);
  });

  it("flags a split that has one ability or an amount other than 2", () => {
    const bad = { abilities: ["str" as const], amount: 2, split: true, max: 20 };
    expect(validateFeatFields({ ...none, ability_increase: bad }).errors).toHaveLength(1);
    expect(validateFeatFields({ ...none, ability_increase: { abilities: [], amount: 1, split: false, max: 20 } }).errors).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("reads a cleared number input as nothing, not zero", () => {
    expect(numberOrNothing("")).toBeUndefined();
    expect(numberOrNothing("13")).toBe(13);
    expect(numberOrNothing(null)).toBeUndefined();
  });

  it("clears the whole condition when the last score is removed", () => {
    const one = withAbilityScore(undefined, "str", 13);
    expect(one).toEqual({ any_of: { str: 13 } });
    expect(withAbilityScore(one, "str", undefined)).toBeUndefined();
    expect(withAbilityScore(one, "dex", 15)).toEqual({ any_of: { str: 13, dex: 15 } });
  });
});
