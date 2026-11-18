import { describe, expect, it } from "vitest";
import { conditionEffectSheetLine, conditionEffectText, plainFinding } from "./conditionEffectText";
import type { SpellConditionEffect } from "@/types/spell.types";

const base: SpellConditionEffect = {
  verdict: "condition", conditions: [], stops_casting: null, speed_zero: false, applies: null, save_ability: null,
  targets: null, only_kinds: [], duration: null, repeat_save: null,
};

describe("conditionEffectText", () => {
  // Bug caught: the sentence a DM reads dropping the save, the kind or the way out, so a spell reads as something else.
  it("says Hold Person in one sentence", () => {
    expect(conditionEffectText({
      ...base, conditions: ["Paralyzed"], applies: "failed_save", save_ability: "WIS",
      targets: { kind: "one", count: 1, more_per_slot_above: 0 }, only_kinds: ["humanoid"],
      duration: { unit: "minute", amount: 1, concentration: false },
      repeat_save: { when: "end_of_its_turn", ability: "WIS" },
    })).toBe("Paralyzed on a failed Wisdom save, one humanoid, up to 1 minute; they save again at the end of each of their turns.");
  });

  // Bug caught: "on a hit" worded as a save, and a poison's several targets read as one.
  it("says a poison that lands on a hit", () => {
    expect(conditionEffectText({
      ...base, conditions: ["Poisoned"], applies: "hit",
      targets: { kind: "several", count: 3, more_per_slot_above: 1 }, only_kinds: [],
      duration: { unit: "round", amount: 2, concentration: false },
    })).toBe("Poisoned on a hit, up to 3 creatures (1 more per slot above its level), up to 2 rounds.");
  });

  // Bug caught: the harm clause lost, so an area charm reads as lasting its full duration.
  it("says an area charm that ends when harmed", () => {
    expect(conditionEffectText({
      ...base, conditions: ["Charmed"], applies: "failed_save", save_ability: "WIS",
      targets: { kind: "area", count: null, more_per_slot_above: 0 }, only_kinds: ["humanoid", "fey"],
      duration: { unit: "hour", amount: 1, concentration: true }, ends_when_harmed: "by_casters_side",
    })).toBe("Charmed on a failed Wisdom save, every humanoid or fey in its area, up to 1 hour (concentration); it ends if the caster or its allies harm them.");
  });

  // Bug caught: a break-free check worded without its abilities or skill, or without costing the action.
  it("says breaking free with a check, and fleeing", () => {
    expect(conditionEffectText({
      ...base, conditions: ["Restrained"], applies: "automatic",
      targets: { kind: "area", count: null, more_per_slot_above: 0 },
      duration: { unit: "until_dispelled", amount: null, concentration: false },
      break_free: { abilities: ["STR", "DEX"], skill: "athletics" }, must_flee: true, leaves_play: true,
    })).toBe("Restrained with no roll, everyone in its area, until dispelled; they can break free with a Strength or Dexterity (Athletics) check as their action; they must flee the caster; they are out of the fight until it ends.");
  });

  // Bug caught: a silence spell with no named condition reading as an empty sentence.
  it("says a spell that only stops casting", () => {
    expect(conditionEffectText({ ...base, stops_casting: "verbal", applies: "automatic" })).toBe("Cannot cast spells with a spoken part with no roll.");
  });

  // Bug caught: the two non-condition verdicts showing code words, or the unset state showing a sentence.
  it("says the other verdicts in plain words and nothing for not said yet", () => {
    expect(conditionEffectText({ ...base, verdict: "not_simple" })).toBe("Rule this one at the table.");
    expect(conditionEffectText({ ...base, verdict: "no_condition" })).toBe("Does nothing a fight needs to know.");
    expect(conditionEffectText(null)).toBe("");
  });
});

describe("conditionEffectSheetLine", () => {
  // Bug caught: a sheet printing "Does nothing" on every spell, or hiding a table ruling from the DM.
  it("shows a condition and a table ruling, and nothing for no condition or not said", () => {
    expect(conditionEffectSheetLine({ ...base, conditions: ["Blinded"] })).toBe("Blinded.");
    expect(conditionEffectSheetLine({ ...base, verdict: "not_simple" })).toBe("Rule this one at the table.");
    expect(conditionEffectSheetLine({ ...base, verdict: "no_condition" })).toBeNull();
    expect(conditionEffectSheetLine(null)).toBeNull();
    expect(conditionEffectSheetLine(undefined)).toBeNull();
  });
});

describe("plainFinding", () => {
  // Bug caught (seen in the running editor, 18 Nov 2026): the check's field names shown to a Dungeon Master,
  // "applies is missing: failed_save, hit or automatic." and "targets is missing."
  it("says what to do in the form's words, never the data's field names", () => {
    expect(plainFinding("applies is missing: failed_save, hit or automatic.")).toBe("Say how it lands: on a failed save, on a hit, or with no roll.");
    expect(plainFinding("targets is missing.")).toBe("Say who it reaches.");
    expect(plainFinding("duration is missing.")).toBe("Say how long it lasts.");
    expect(plainFinding("the description never says Stunned.")).toBe("The description never says Stunned.");
    expect(plainFinding("a condition entry names at least one condition, or says it stops casting.")).toBe("Tick at least one condition, or say it stops spellcasting.");
  });

  it("hides what the form keeps right by itself, and never falls back to a field name", () => {
    expect(plainFinding("an area has no count.")).toBeNull();
    expect(plainFinding("duration.concentration is true but the spell's own record says false.")).toBeNull();
    const unknown = plainFinding("some_new_field is wrong.");
    expect(unknown).not.toBeNull();
    expect(unknown).not.toContain("_");
  });
});

