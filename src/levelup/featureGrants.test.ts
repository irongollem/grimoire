import { describe, expect, it } from "vitest";
import type { ChoiceValue } from "@/components/features/choiceValue";
import type { DueChoice } from "@/rules/features/levelUpChoices";
import { applyFeatureGrants, classHasSpellcastingProgression, featureSpellRows, mergeSkillChanges } from "./featureGrants";

const value = (picks: string[]): ChoiceValue => ({ picks, replace: null, asi: null, ability: { primary: null, secondary: null } });

function spellDue(featureId: string, name: string, level: number, freeCast: boolean): DueChoice {
  return {
    featureId,
    featureName: name,
    picks: 1,
    replaceAllowed: false,
    existing: [],
    choice: { key: "spell", label: "Spell", amount: 1, pick: { kind: "spell", lists: ["Wizard"], level, free_cast: freeCast } },
  } as unknown as DueChoice;
}

describe("applyFeatureGrants", () => {
  it("adds only what is not held, never downgrading expertise", () => {
    const out = applyFeatureGrants(
      { skills: { arcana: "expertise", history: "none" }, tools: ["Dice Set"], languages: ["Common"] },
      [{ skills: ["arcana", "history", "nature"], tools: ["dice set", "Lute"], languages: ["COMMON", "Dwarvish"] }],
    );
    expect(out.skills).toEqual({
      history: { from: "none", to: "proficient" },
      nature: { from: null, to: "proficient" },
    });
    expect(out.tools).toEqual(["Dice Set", "Lute"]);
    expect(out.languages).toEqual(["Common", "Dwarvish"]);
    expect(out.granted).toEqual({ tools: ["Lute"], languages: ["Dwarvish"] });
  });

  it("does not grant the same thing twice from two features", () => {
    const out = applyFeatureGrants({ skills: {}, tools: [], languages: [] }, [{ tools: ["Lute"] }, { tools: ["lute"] }, undefined]);
    expect(out.granted.tools).toEqual(["Lute"]);
  });
});

describe("mergeSkillChanges", () => {
  it("keeps the earliest from and the latest to, and drops a round trip", () => {
    expect(
      mergeSkillChanges({ a: { from: null, to: "proficient" } }, { a: { from: "proficient", to: "expertise" }, b: { from: null, to: "proficient" } }),
    ).toEqual({ a: { from: null, to: "expertise" }, b: { from: null, to: "proficient" } });
    expect(mergeSkillChanges({ a: { from: "none", to: "proficient" } }, { a: { from: "proficient", to: "none" } })).toEqual({});
  });
});

describe("featureSpellRows", () => {
  const base = { existingSpellIds: new Set<string>() };

  it("stores a feat's pick under the feat, with one free cast for a levelled spell only", () => {
    const { rows } = featureSpellRows({
      ...base,
      due: [spellDue("feat1", "Magic Initiate", 0, true), spellDue("feat1b", "Magic Initiate", 1, true)],
      values: { "feat1:spell": value(["light"]), "feat1b:spell": value(["shield"]) },
      isFeat: () => true,
      classHasSpellcasting: true,
    });
    expect(rows).toEqual([
      { spell_id: "light", source_type: "feat", source_label: "Magic Initiate", is_prepared: false },
      { spell_id: "shield", source_type: "feat", source_label: "Magic Initiate", is_prepared: false, uses_per_day: 1, uses_remaining: 1, resets_on: "long_rest" },
    ]);
  });

  it("stores a class feature's pick on a caster as an always-prepared class row", () => {
    const { rows, spellIds } = featureSpellRows({
      ...base, due: [spellDue("f", "Domain Spells", 1, false)], values: { "f:spell": value(["bless"]) },
      isFeat: () => false, classHasSpellcasting: true,
    });
    expect(rows).toEqual([{ spell_id: "bless", is_prepared: true, always_prepared: true }]);
    expect(spellIds).toEqual(["bless"]);
  });

  it("stores it as source other on a class that does not cast", () => {
    const { rows } = featureSpellRows({
      ...base, due: [spellDue("f", "Mystic Gift", 1, true)], values: { "f:spell": value(["bless"]) },
      isFeat: () => false, classHasSpellcasting: false,
    });
    expect(rows).toEqual([
      { spell_id: "bless", source_type: "other", source_label: "Mystic Gift", is_prepared: false, uses_per_day: 1, uses_remaining: 1, resets_on: "long_rest" },
    ]);
  });

  it("skips spells already held and entries with no value", () => {
    const { rows } = featureSpellRows({
      due: [spellDue("f", "X", 1, false), spellDue("g", "Y", 1, false)],
      values: { "f:spell": value(["bless"]) },
      existingSpellIds: new Set(["bless"]),
      isFeat: () => false, classHasSpellcasting: true,
    });
    expect(rows).toEqual([]);
  });
});

describe("classHasSpellcastingProgression", () => {
  it("is true for a caster type or any slot in the table, false for neither", () => {
    expect(classHasSpellcastingProgression({ caster_type: "prepared", spell_slots: null })).toBe(true);
    expect(classHasSpellcastingProgression({ caster_type: "none", spell_slots: [[0, 0], [2, 0]] })).toBe(true);
    expect(classHasSpellcastingProgression({ caster_type: "none", spell_slots: [[0, 0]] })).toBe(false);
    expect(classHasSpellcastingProgression({ caster_type: null })).toBe(false);
    expect(classHasSpellcastingProgression(null)).toBe(false);
    expect(classHasSpellcastingProgression(undefined)).toBe(false);
  });
});
