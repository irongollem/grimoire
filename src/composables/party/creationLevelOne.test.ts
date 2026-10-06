import { describe, expect, it } from "vitest";
import { dueKey, type ChoiceValue } from "@/components/features/choiceValue";
import { resolveLevelPicks } from "@/levelup/levelPicks";
import type { GrantedFeature } from "@/rules/features/characterFeatures";
import { choicesDue } from "@/rules/features/levelUpChoices";
import { parseMechanics } from "@/rules/features/mechanics";
import type { FeatureMechanics } from "@/rules/features/mechanics.types";
import { resolveOriginFeat, unresolvedOriginFeatMessage, withOriginFeat } from "@/rules/backgroundAsi";
import type { ClassFeature } from "@/types/feature.types";
import { characterSpellInserts, levelOneWrites, scoresAfterBonuses } from "./creationLevelOne";

function classFeature(id: string, name: string, className: string, mechanics: FeatureMechanics): GrantedFeature {
  const feature = { id, name, kind: "feature", mechanics, conceptual_key: null } as unknown as ClassFeature;
  return {
    feature,
    mechanics: parseMechanics(mechanics).mechanics,
    grant: { kind: "class", className, subclassName: null, classLevel: 1, levelsGained: [1] },
    scalingValue: null,
  };
}

const scores = { str: 10, dex: 15, con: 13, int: 12, wis: 10, cha: 8 };
const picked = (picks: string[]): ChoiceValue => ({ picks, replace: null, asi: null, ability: { primary: null, secondary: null } });

/** Level 0 to 1 in `className`, answered with `answers`, as the wizard resolves it. */
function takeLevelOne(granted: GrantedFeature[], className: string, answers: string[][], skills = {}) {
  const due = choicesDue({ granted, className, fromLevel: 0, toLevel: 1, characterLevelAfter: 1, classChoices: {} });
  const values: Record<string, ChoiceValue> = {};
  due.forEach((d, i) => { values[dueKey(d)] = picked(answers[i]); });
  const picks = resolveLevelPicks({
    due, values, swaps: {}, scores, skills, featsById: new Map(), masteryIdByName: new Map(),
  });
  return { due, picks };
}

const base = {
  masteries: [], tools: [], languages: [], classResources: {}, hpGained: 9,
  featureGrants: [], featureSpells: { due: [], values: {}, isFeat: () => false, classHasSpellcasting: false },
};

describe("level 1 choices at creation", () => {
  it("a 2014 Rogue records two expertise picks in level_choices[1] and sets the skills", () => {
    const expertise = classFeature("exp", "Expertise", "Rogue", {
      choices: [{ key: "expertise", label: "Expertise", pick: { kind: "expertise", thieves_tools: true }, count: { kind: "per_grant", amount: 2 }, replace_on_level_up: false }],
    });
    const skills = { stealth: "proficient", perception: "proficient", acrobatics: "proficient" } as const;
    const { due, picks } = takeLevelOne([expertise], "Rogue", [["stealth", "thieves_tools"]], skills);
    expect(due).toHaveLength(1);
    expect(due[0].picks).toBe(2);

    const writes = levelOneWrites({ ...base, classChoices: {}, skills, picks, className: "Rogue", classDefinitionId: "rogue-def" });
    expect(writes.level_choices[1].record.choices.expertise).toEqual({ added: ["stealth", "thieves_tools"], removed: [] });
    expect(writes.level_choices[1]).toMatchObject({ class_name: "Rogue", class_definition_id: "rogue-def", is_new_class: true, hp_gained: 9 });
    expect(writes.class_choices.expertise).toEqual(["stealth", "thieves_tools"]);
    expect(writes.skill_proficiencies.stealth).toBe("expertise");
    expect(writes.skill_proficiencies.perception).toBe("proficient");
    expect(writes.level_choices[1].skills).toEqual({ stealth: { from: "proficient", to: "expertise" } });
  });

  it("a 2014 Fighter stores the fighting style it chose", () => {
    const style = classFeature("fs", "Fighting Style", "Fighter", {
      choices: [{ key: "fighting_style", label: "Fighting Style", pick: { kind: "option", set: "fighting_style" }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }],
    });
    const { picks } = takeLevelOne([style], "Fighter", [["defense"]]);
    const writes = levelOneWrites({ ...base, classChoices: { starting: true }, skills: {}, picks, className: "Fighter", classDefinitionId: "f" });
    expect(writes.class_choices).toEqual({ starting: true, fighting_style: ["defense"] });
    expect(writes.level_choices[1].record.choices.fighting_style.added).toEqual(["defense"]);
  });

  it("a 2024 Fighter's Weapon Mastery goes to weapon_masteries as ids, not class_choices", () => {
    const mastery = classFeature("wm", "Weapon Mastery", "Fighter", {
      choices: [{ key: "weapon_masteries", label: "Weapon Mastery", pick: { kind: "option", set: "weapon_mastery" }, count: { kind: "known", values: { "1": 2 } }, replace_on_level_up: true }],
    });
    const due = choicesDue({ granted: [mastery], className: "Fighter", fromLevel: 0, toLevel: 1, characterLevelAfter: 1, classChoices: {} });
    const picks = resolveLevelPicks({
      due, values: { [dueKey(due[0])]: picked(["Longsword", "Handaxe"]) }, swaps: {}, scores, skills: {},
      featsById: new Map(), masteryIdByName: new Map([["Longsword", "id-ls"], ["Handaxe", "id-ha"]]),
    });
    const writes = levelOneWrites({ ...base, classChoices: {}, skills: {}, picks, className: "Fighter", classDefinitionId: "f" });
    expect(writes.weapon_masteries).toEqual(["id-ls", "id-ha"]);
    expect(writes.class_choices).toEqual({});
  });

  it("asks the origin feat's own choice (2024 Skilled) in the same pass and records the skills", () => {
    const skilled: GrantedFeature = {
      feature: { id: "skilled", name: "Skilled", kind: "feat" } as unknown as ClassFeature,
      mechanics: { choices: [{ key: "skilled", label: "Skills", pick: { kind: "skill", from: [] }, count: { kind: "per_grant", amount: 3 }, replace_on_level_up: false }] },
      grant: { kind: "feat", via: "origin", atLevel: null },
      scalingValue: null,
    };
    const { due, picks } = takeLevelOne([skilled], "", [["arcana", "history", "stealth"]]);
    expect(due).toMatchObject([{ picks: 3 }]);
    const writes = levelOneWrites({ ...base, classChoices: { origin_feat_id: "skilled", feats: ["skilled"] }, skills: {}, picks, className: "", classDefinitionId: null });
    expect(writes.skill_proficiencies).toEqual({ arcana: "proficient", history: "proficient", stealth: "proficient" });
    // No class, no definition to record the level against: the effects land, the history entry waits.
    expect(writes.level_choices).toEqual({});
  });

  it("leaves everything alone when nothing is owed", () => {
    const { picks } = takeLevelOne([], "Wizard", []);
    const writes = levelOneWrites({ ...base, classChoices: { a: 1 }, skills: { arcana: "proficient" }, picks, className: "Wizard", classDefinitionId: "w" });
    expect(writes.class_choices).toEqual({ a: 1 });
    expect(writes.skill_proficiencies).toEqual({ arcana: "proficient" });
    expect(writes.level_choices[1].record.choices).toEqual({});
  });
});

describe("origin feat at creation", () => {
  const alert = {
    id: "alert-24", name: "Alert", kind: "feat", feat_category: "origin", ruleset: "2024", conceptual_key: "alert",
  } as unknown as ClassFeature;

  it("stores origin_feat_id, the entry in feats and the variant", () => {
    const resolved = resolveOriginFeat({ name: "Alert", variant: null }, [alert], "2024");
    expect(resolved?.feature?.id).toBe("alert-24");
    const choices = withOriginFeat({}, { featId: resolved!.feature!.id, variant: resolved!.originFeat.variant });
    expect(choices).toEqual({ origin_feat_id: "alert-24", feats: ["alert-24"] });
  });

  it("does not resolve, and says so, when the feat is not in this table's books", () => {
    const resolved = resolveOriginFeat({ name: "Crusher", variant: null }, [alert], "2024");
    expect(resolved?.feature).toBeNull();
    expect(unresolvedOriginFeatMessage("Crusher")).toBe("This background's origin feat, Crusher, is not in this table's books.");
  });
});

describe("fixed grants and spell picks at level 1", () => {
  it("adds only what the character lacks, records it, and merges skill changes into the entry", () => {
    const { picks } = takeLevelOne([], "Wizard", []);
    const writes = levelOneWrites({
      ...base, classChoices: {}, skills: { arcana: "proficient" }, tools: ["Thieves' Tools"], languages: ["Common"],
      picks, className: "Wizard", classDefinitionId: "wiz",
      featureGrants: [{ skills: ["arcana", "history"], tools: ["thieves' tools", "Herbalism Kit"], languages: ["Draconic"] }],
    });
    expect(writes.skill_proficiencies).toEqual({ arcana: "proficient", history: "proficient" });
    expect(writes.tool_proficiencies).toEqual(["Thieves' Tools", "Herbalism Kit"]);
    expect(writes.languages).toEqual(["Common", "Draconic"]);
    expect(writes.level_choices[1]).toMatchObject({
      skills: { history: { from: null, to: "proficient" } },
      granted_profs: { tools: ["Herbalism Kit"], languages: ["Draconic"] },
    });
  });

  it("turns a feat's spell pick into feat rows and records the ids in the entry", () => {
    const magicInitiate = classFeature("mi", "Magic Initiate", "Wizard", {
      choices: [{ key: "mi_spell", label: "Spell", pick: { kind: "spell", lists: ["Wizard"], level: 1, free_cast: true }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }],
    });
    const due = choicesDue({ granted: [magicInitiate], className: "Wizard", fromLevel: 0, toLevel: 1, characterLevelAfter: 1, classChoices: {} });
    const values = { [dueKey(due[0])]: picked(["srd_srd_shield"]) };
    const { picks } = takeLevelOne([], "Wizard", []);
    const writes = levelOneWrites({
      ...base, classChoices: {}, skills: {}, picks, className: "Wizard", classDefinitionId: "wiz",
      featureSpells: { due, values, isFeat: () => true, classHasSpellcasting: true },
    });
    expect(writes.spellRows).toEqual([
      { spell_id: "srd_srd_shield", source_type: "feat", source_label: "Magic Initiate", is_prepared: false, uses_per_day: 1, uses_remaining: 1, resets_on: "long_rest" },
    ]);
    expect(writes.level_choices[1].feature_spells).toEqual(["srd_srd_shield"]);
  });
});

describe("characterSpellInserts", () => {
  it("pins a class row to the class row and leaves feat rows alone", () => {
    const rows = [
      { spell_id: "a", is_prepared: true, always_prepared: true },
      { spell_id: "b", source_type: "feat", source_label: "Magic Initiate", is_prepared: false },
    ];
    expect(characterSpellInserts("pm", rows, "cls")).toEqual([
      { spell_id: "a", is_prepared: true, always_prepared: true, party_member_id: "pm", source_type: "class", source_class_id: "cls" },
      { spell_id: "b", source_type: "feat", source_label: "Magic Initiate", is_prepared: false, party_member_id: "pm" },
    ]);
  });

  it("refuses a class row when there is no class row", () => {
    expect(() => characterSpellInserts("pm", [{ spell_id: "a" }], null)).toThrow();
  });
});

describe("scoresAfterBonuses", () => {
  const input = { scores, asiMode: "bonus" as const, customAsi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, structured: [], background: {} };

  it("adds structured species and background increases, capped at 20", () => {
    const out = scoresAfterBonuses({ ...input, scores: { ...scores, dex: 19 }, structured: [{ dexterity: 2 }, { str: 1 }], background: { con: 2 } });
    expect(out).toEqual({ str: 11, dex: 20, con: 15, int: 12, wis: 10, cha: 8 });
  });

  it("skips free-text species increases and honours a custom distribution instead of species ones", () => {
    expect(scoresAfterBonuses({ ...input, structured: [{ description: "two of your choice" }] })).toEqual(scores);
    const custom = scoresAfterBonuses({ ...input, asiMode: "custom", customAsi: { ...input.customAsi, cha: 2 }, structured: [{ str: 2 }] });
    expect(custom).toEqual({ ...scores, cha: 10 });
  });
});
