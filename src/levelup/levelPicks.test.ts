import { describe, expect, it } from "vitest";
import { dueKey, type ChoiceValue } from "@/components/features/choiceValue";
import type { GrantedFeature } from "@/rules/features/characterFeatures";
import { choicesDue, applyLevelChoices, type DueChoice } from "@/rules/features/levelUpChoices";
import { parseMechanics } from "@/rules/features/mechanics";
import type { FeatureMechanics } from "@/rules/features/mechanics.types";
import type { ClassFeature } from "@/types/feature.types";
import type { CharacterClass } from "@/types/multiclass.types";
import type { PartyMember } from "@/types/party.types";
import { buildDeLevelPayload } from "./buildDeLevelPayload";
import { buildLevelUpPayload, type BuildLevelUpPayloadInput } from "./buildLevelUpPayload";
import { applyMasteryChanges, applySkillChanges, resolveLevelPicks, type ResolveInput } from "./levelPicks";

function granted(id: string, name: string, mechanics: FeatureMechanics, className: string, levelsGained: number[], classLevel: number): GrantedFeature {
  const feature = { id, name, kind: "feature", mechanics, conceptual_key: null } as unknown as ClassFeature;
  return { feature, mechanics: parseMechanics(mechanics).mechanics, grant: { kind: "class", className, subclassName: null, classLevel, levelsGained }, scalingValue: null };
}

const asiFeature = (className: string, levels: number[], classLevel: number) =>
  granted(`asi-${className}`, "Ability Score Improvement", {
    choices: [{ key: "asi", label: "Ability Score Improvement", pick: { kind: "asi_or_feat" }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }],
  }, className, levels, classLevel);
const expertiseFeature = granted("exp", "Expertise", {
  choices: [{ key: "expertise", label: "Expertise", pick: { kind: "expertise", thieves_tools: false }, count: { kind: "per_grant", amount: 2 }, replace_on_level_up: false }],
}, "Rogue", [1, 6], 6);
const invocationFeature = granted("inv", "Eldritch Invocations", {
  choices: [{ key: "eldritch_invocations", label: "Eldritch Invocations", pick: { kind: "option", set: "eldritch_invocation" }, count: { kind: "known", values: { "2": 2, "5": 3 } }, replace_on_level_up: true }],
}, "Warlock", [2], 5);
const masteryFeature = granted("mast", "Weapon Mastery", {
  choices: [{ key: "weapon_masteries", label: "Weapon Mastery", pick: { kind: "option", set: "weapon_mastery" }, count: { kind: "known", values: { "1": 2, "4": 3 } }, replace_on_level_up: true }],
}, "Fighter", [1], 4);

const athlete = { id: "athlete", name: "Athlete", kind: "feat", ability_increase: { abilities: ["str", "dex"], amount: 1, split: false, max: 20 } } as unknown as ClassFeature;
const scores = { str: 15, dex: 12, con: 14, int: 8, wis: 13, cha: 11 };

function dueFor(g: GrantedFeature, className: string, from: number, to: number, classChoices: Record<string, unknown> = {}): DueChoice[] {
  return choicesDue({ granted: [g], className, fromLevel: from, toLevel: to, characterLevelAfter: to, classChoices });
}

function resolve(due: DueChoice[], values: Record<string, ChoiceValue>, extra: Partial<ResolveInput> = {}) {
  return resolveLevelPicks({
    due,
    values,
    swaps: {},
    scores,
    skills: {},
    featsById: new Map([[athlete.id, athlete]]),
    masteryIdByName: new Map(),
    ...extra,
  });
}

const blank = { picks: [], replace: null, asi: null, ability: { primary: null, secondary: null } } satisfies ChoiceValue;

describe("resolveLevelPicks", () => {
  it("a Fighter 3 to 4 who takes a feat records the feat and the ability it raised", () => {
    const [due] = dueFor(asiFeature("Fighter", [4], 4), "Fighter", 3, 4);
    const picks = resolve([due], {
      [dueKey(due)]: { ...blank, asi: { mode: "feat", primary: null, secondary: null }, picks: ["athlete"], ability: { primary: "str", secondary: null } },
    });
    expect(picks.record.feats).toEqual(["athlete"]);
    expect(picks.record.abilityIncreases).toEqual({ str: 1 });
    expect(picks.record.choices).toEqual({});
  });

  it("a +2 stops at 20 and records only what landed", () => {
    const [due] = dueFor(asiFeature("Fighter", [4], 4), "Fighter", 3, 4);
    const picks = resolve([due], { [dueKey(due)]: { ...blank, asi: { mode: "plus2", primary: "str", secondary: null } } }, { scores: { ...scores, str: 19 } });
    expect(picks.record.abilityIncreases).toEqual({ str: 1 });
  });

  it("a Rogue 5 to 6 takes two expertise picks and the skills change with them", () => {
    const [due] = dueFor(expertiseFeature, "Rogue", 5, 6);
    const picks = resolve([due], { [dueKey(due)]: { ...blank, picks: ["stealth", "perception"] } }, {
      skills: { stealth: "proficient", perception: "proficient", arcana: "proficient" },
    });
    expect(picks.record.choices.expertise).toEqual({ added: ["stealth", "perception"], removed: [] });
    expect(picks.skills).toEqual({
      stealth: { from: "proficient", to: "expertise" },
      perception: { from: "proficient", to: "expertise" },
    });
  });

  it("a Warlock 4 to 5 takes an invocation and replaces another; the replacement keeps its slot", () => {
    const [due] = dueFor(invocationFeature, "Warlock", 4, 5, { eldritch_invocations: ["Armor of Shadows", "Devil's Sight"] });
    expect(due.replaceAllowed).toBe(true);
    const picks = resolve([due], {
      [dueKey(due)]: { ...blank, picks: ["Agonizing Blast"], replace: { from: "Armor of Shadows", to: "Fiendish Vigor" } },
    });
    expect(picks.record.choices.eldritch_invocations).toEqual({
      added: ["Fiendish Vigor", "Agonizing Blast"],
      removed: ["Armor of Shadows"],
    });
    const next = applyLevelChoices({ eldritch_invocations: ["Armor of Shadows", "Devil's Sight"] }, picks.record);
    expect(next.eldritch_invocations).toEqual(["Fiendish Vigor", "Devil's Sight", "Agonizing Blast"]);
  });

  it("Weapon Mastery goes to the column as item ids, never into class_choices", () => {
    const due = dueFor(masteryFeature, "Fighter", 3, 4, { weapon_masteries: ["Longsword", "Handaxe"] });
    const picks = resolve(due, { [dueKey(due[0])]: { ...blank, picks: ["Rapier"], replace: { from: "Handaxe", to: "Greataxe" } } }, {
      masteryIdByName: new Map([["Rapier", "w-rapier"], ["Greataxe", "w-greataxe"], ["Handaxe", "w-handaxe"]]),
    });
    expect(picks.record.choices).toEqual({});
    expect(picks.masteries).toEqual({ added: ["w-greataxe", "w-rapier"], removed: ["w-handaxe"] });
  });
});

describe("a level and its de-level", () => {
  const classRow: CharacterClass = {
    id: "cc1", party_member_id: "m1", class_name: "Fighter", class_definition_id: "fighter-def", class_definition_kind: "system",
    subclass_name: null, subclass_definition_id: null, levels: 3, is_primary: true, hit_dice_used: 0, sort_order: 0, created_at: "", updated_at: "",
  };
  const before = {
    id: "m1", level: 3, proficiency_bonus: 2, max_hp: 28, current_hp: 28, hit_dice_remaining: 3,
    str: 15, dex: 12, con: 15, int: 8, wis: 13, cha: 11,
    spell_slots: [], class_resources: {}, tool_proficiencies: ["Smith's Tools"], languages: [],
    class_choices: { fighting_style: ["Defense"], feats: ["tough"] },
    skill_proficiencies: { stealth: "proficient", athletics: "proficient" },
    weapon_masteries: ["w-longsword", "w-handaxe"],
    level_choices: { 2: { class_name: "Fighter", is_new_class: false, hp_gained: 6 } },
  } as unknown as PartyMember;

  function input(picks: BuildLevelUpPayloadInput["picks"]): BuildLevelUpPayloadInput {
    return {
      member: before, nextLevel: 4, newProfBonus: 2, hpGain: 7, newHitDiceCount: 4, postLevelupSpellSlots: [],
      needsSubclassChoice: false, isAddingNewClass: false, newClassProficiencyGrants: [], memberClass: "Fighter",
      chosenExistingEntry: { id: "cc1", levels: 3, class_definition_id: "fighter-def", is_primary: true },
      existingClassOptions: [{ id: "cc1", class_name: "Fighter", levels: 3, is_primary: true }],
      picks, classResources: {}, subclassInput: "", subclassDefinitionId: null,
      selectedSpellIds: new Set(), selectedCantripIds: new Set(), newClassName: "", newClassDefinitionId: null,
      newClassDefinitionKind: null, grantedSpellsForThisLevel: [], existingSpellIds: new Set(),
      featureGrants: [], featureSpells: { due: [], values: {}, isFeat: () => false, classHasSpellcasting: false },
    };
  }

  it("restores the member exactly: feat, +2 Constitution, expertise, a skill, masteries and a swap", () => {
    const picks = resolveLevelPicks({
      due: [], values: {}, swaps: { favored_enemy: "favored-foe" }, scores: { str: 15, dex: 12, con: 15, int: 8, wis: 13, cha: 11 },
      skills: before.skill_proficiencies, featsById: new Map(), masteryIdByName: new Map(),
    });
    // Hand-built on top of the swap: the other picks a Fighter's level can hold.
    picks.record.feats = ["athlete"];
    picks.record.abilityIncreases = { con: 1, str: 1 };
    picks.record.choices = { fighting_style: { added: ["Archery"], removed: [] } };
    picks.skills = { stealth: { from: "proficient", to: "expertise" }, arcana: { from: null, to: "proficient" } };
    picks.masteries = { added: ["w-rapier"], removed: ["w-handaxe"] };

    const up = buildLevelUpPayload(input(picks)).memberUpdate;
    expect(up.con).toBe(16);
    expect((up.class_choices as Record<string, unknown>).feats).toEqual(["tough", "athlete"]);
    expect(up.skill_proficiencies).toEqual({ stealth: "expertise", athletics: "proficient", arcana: "proficient" });
    expect(up.weapon_masteries).toEqual(["w-longsword", "w-rapier"]);

    const after = { ...before, ...up } as unknown as PartyMember;
    const entry = (up.level_choices as PartyMember["level_choices"])[4];
    const down = buildDeLevelPayload({
      member: after, entry, classRow: { ...classRow, levels: 4 }, characterClasses: [{ ...classRow, levels: 4 }],
      ruleset: "2014", classSlotTable: null, classResources: {},
    }).memberUpdate;
    const restored = { ...after, ...down } as PartyMember;

    expect(restored.level).toBe(3);
    expect(restored.max_hp).toBe(before.max_hp);
    expect(restored.current_hp).toBe(before.current_hp);
    expect(restored.hit_dice_remaining).toBe(3);
    for (const k of ["str", "dex", "con", "int", "wis", "cha"] as const) expect(restored[k]).toBe(before[k]);
    expect(restored.class_choices).toEqual(before.class_choices);
    expect(restored.skill_proficiencies).toEqual(before.skill_proficiencies);
    expect([...restored.weapon_masteries].sort()).toEqual([...before.weapon_masteries].sort());
    expect(restored.level_choices).toEqual(before.level_choices);
  });

  it("takes back the tools a new class gave and nothing the character already held", () => {
    const base = input({ record: { choices: {}, abilityIncreases: {}, feats: [], swaps: {} }, skills: {}, masteries: { added: [], removed: [] } });
    const up = buildLevelUpPayload({
      ...base, isAddingNewClass: true, chosenExistingEntry: null, newClassName: "Rogue", newClassDefinitionId: "rogue-def",
      newClassDefinitionKind: "system", memberClass: "Rogue", newClassProficiencyGrants: ["Smith's Tools", "Thieves' Tools"],
    }).memberUpdate;
    const after = { ...before, ...up } as unknown as PartyMember;
    const entry = (up.level_choices as PartyMember["level_choices"])[4];
    expect(entry.new_class_profs).toEqual(["Thieves' Tools"]);
    const rogueRow: CharacterClass = { ...classRow, id: "cc2", class_name: "Rogue", class_definition_id: "rogue-def", levels: 1, is_primary: false };
    const down = buildDeLevelPayload({
      member: after, entry, classRow: rogueRow, characterClasses: [classRow, rogueRow], ruleset: "2014", classSlotTable: null, classResources: {},
    });
    expect(down.memberUpdate.tool_proficiencies).toEqual(["Smith's Tools"]);
    expect(down.classOp).toEqual({ op: "delete", id: "cc2" });
  });
});

describe("applySkillChanges and applyMasteryChanges", () => {
  it("revert puts a skill back to absent when it had no entry", () => {
    const changes = { arcana: { from: null, to: "proficient" as const } };
    const applied = applySkillChanges({}, changes, "apply");
    expect(applied).toEqual({ arcana: "proficient" });
    expect(applySkillChanges(applied, changes, "revert")).toEqual({});
  });

  it("masteries add and remove ids, each once", () => {
    const changes = { added: ["a", "b"], removed: ["c"] };
    expect(applyMasteryChanges(["c", "a"], changes, "apply")).toEqual(["a", "b"]);
    expect(applyMasteryChanges(["a", "b"], changes, "revert")).toEqual(["c"]);
  });
});
