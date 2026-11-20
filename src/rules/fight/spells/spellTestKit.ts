/** Fixtures shared by the `rules/fight/spells` tests and the server's cast tests. Not imported by anything that ships. */
import type { SpellConditionEffect, StructuredSpellEffect } from "../../../types/spell.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import { emptyDefenses, type StatBlockEntry } from "../../../types/statBlock.types.ts";
import type { SpellRecord } from "./spellChoice.ts";

const damageEffect = (over: Partial<StructuredSpellEffect>): StructuredSpellEffect => ({
  id: "base", phase: "impact", outcome: "failed_save", target: { type: "point", count: 1 }, kind: "damage", dice: "8d6",
  multiplier: 1, damageType: "fire", condition: null, description: null, scaling: null, modifier: null, ...over,
});

/** The reviewed SRD 5.1 Fireball row as the library stores it: 8d6 fire, DEX save for half, +1d6 per slot above 3rd. */
export function fireball(over: Partial<SpellRecord> = {}): SpellRecord {
  const scaling = { mode: "slot" as const, dice: "1d6" };
  return {
    id: "srd_srd_fireball", name: "Fireball", level: 3, range: "150 feet", ruleset: "2014", source: "srd-2014", concentration: false,
    attack_type: "save", save_attribute: "DEX", save_effect: "half", damage_rolls: [{ dice: "8d6", type: "fire" }],
    healing_dice: null, aoe_shape: "sphere", aoe_size: "20 feet", higher_level_damage: { type: null, dice_per_level: "1d6" },
    mechanics_reviewed: true,
    effects: [
      damageEffect({ id: "base", scaling }),
      damageEffect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, scaling }),
    ],
    ...over,
  };
}

/** SRD 5.1 Fire Bolt: a ranged spell attack, 1d10 fire, 2d10 from 5th level. Flat columns only, as a record with no effects. */
export function fireBolt(over: Partial<SpellRecord> = {}): SpellRecord {
  return {
    id: "srd_srd_fire_bolt", name: "Fire Bolt", level: 0, range: "120 feet", ruleset: "2014", source: "srd-2014", concentration: false,
    attack_type: "ranged_spell", save_attribute: null, save_effect: null, damage_rolls: [{ dice: "1d10", type: "fire" }],
    healing_dice: null, aoe_shape: null, aoe_size: null, higher_level_damage: null, mechanics_reviewed: true, effects: [],
    ...over,
  };
}

const other = (name: string, description: string): StatBlockEntry => ({
  name, description, structured: { kind: "other", source: "parsed" },
});

/** SRD 5.1 mage: 9th-level spellcaster, spell save DC 14, +6 to hit with spell attacks. */
export const MAGE_SPELLCASTING = other(
  "Spellcasting",
  "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:\n\n* Cantrips (at will): fire bolt, light\n* 1st level (4 slots): magic missile, shield\n* 3rd level (3 slots): counterspell, fireball\n* 4th level (3 slots): ice storm",
);

export function mageBlock(over: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return {
    armor_class: 12, hit_points: "9d8", speed: "30 ft.", str: 9, dex: 14, con: 11, int: 17, wis: 12, cha: 11,
    challenge_rating: "6", defenses: emptyDefenses(), special_abilities: [MAGE_SPELLCASTING], ...over,
  };
}

/** SRD 5.1 "Hold Person" as its agreed reading would store it: Paralyzed on a failed WIS save, 1 minute, repeated at the end of each of its turns. */
export function holdPersonEffect(over: Partial<SpellConditionEffect> = {}): SpellConditionEffect {
  return {
    verdict: "condition", conditions: ["Paralyzed"], stops_casting: null, speed_zero: false, applies: "failed_save", save_ability: "WIS",
    targets: { kind: "one", count: 1, more_per_slot_above: 1 }, only_kinds: [],
    duration: { unit: "minute", amount: 1, concentration: true }, repeat_save: { when: "end_of_its_turn", ability: "WIS" }, ...over,
  };
}

/**
 * SRD 5.1 "Hold Person" as the library stores it: a 2nd-level concentration save spell with no damage and a "special" save
 * effect. `only_kinds` is empty here so the spell is not limited to a kind; the real agreed reading says "humanoid", and
 * `holdPersonEffect({ only_kinds: ["humanoid"] })` is that one.
 */
export function holdPerson(over: Partial<SpellRecord> = {}): SpellRecord {
  return {
    id: "srd_srd_hold_person", name: "Hold Person", level: 2, range: "60 feet", ruleset: "2014", source: "srd-2014", concentration: true,
    attack_type: "save", save_attribute: "WIS", save_effect: "special", damage_rolls: null, healing_dice: null, aoe_shape: null, aoe_size: null,
    higher_level_damage: null, mechanics_reviewed: true, effects: [], condition_effect: holdPersonEffect(), ...over,
  };
}

/** A mage that lists Hold Person (2nd level, 3 slots) beside Fireball: spell save DC 14. */
export function mageWithHold(): MonsterStatBlock {
  return mageBlock({
    special_abilities: [other(
      "Spellcasting",
      "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:\n\n* 2nd level (3 slots): hold person\n* 3rd level (3 slots): fireball",
    )],
  });
}

/**
 * SRD 5.2.1 "Charm Monster" as its reading would store it: Charmed on a failed WIS save for an hour, ended when the caster
 * or its allies damage the target. No concentration in this fixture, so the caster's own concentration stays out of the way.
 */
export function charmMonster(over: Partial<SpellRecord> = {}): SpellRecord {
  return holdPerson({
    id: "srd_srd_2024_charm_monster", name: "Charm Monster", level: 4, concentration: false,
    condition_effect: holdPersonEffect({
      conditions: ["Charmed"], duration: { unit: "hour", amount: 1, concentration: false }, repeat_save: null, ends_when_harmed: "by_casters_side",
    }),
    ...over,
  });
}

/** A mage that lists Charm Monster (4th level, 3 slots): spell save DC 14. */
export function mageWithCharm(): MonsterStatBlock {
  return mageBlock({
    special_abilities: [other(
      "Spellcasting",
      "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:\n\n* 4th level (3 slots): charm monster",
    )],
  });
}

/**
 * SRD 5.1 "Black Tentacles" as its reading would store it, shortened to its condition: Restrained on a failed DEX save for a
 * minute of concentration, and "A creature restrained by the tentacles can use its action to make a Strength or Dexterity
 * check (its choice) against your spell save DC. On a success, it frees itself."
 */
export function blackTentacles(over: Partial<SpellRecord> = {}): SpellRecord {
  return holdPerson({
    id: "srd_srd_black_tentacles", name: "Black Tentacles", level: 4, save_attribute: "DEX",
    condition_effect: holdPersonEffect({
      conditions: ["Restrained"], save_ability: "DEX", repeat_save: null, break_free: { abilities: ["STR", "DEX"], skill: null },
    }),
    ...over,
  });
}

/** A mage that lists Black Tentacles (4th level, 3 slots): spell save DC 14. */
export function mageWithTentacles(): MonsterStatBlock {
  return mageBlock({
    special_abilities: [other(
      "Spellcasting",
      "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:\n\n* 4th level (3 slots): black tentacles",
    )],
  });
}

/**
 * SRD 5.1 "Fear" as its reading would store it, shortened to its condition: Frightened on a failed WIS save for a minute of
 * concentration, and "While frightened by this spell, a creature must take the Dash action and move away from you by the
 * safest available route on each of its turns, unless there is nowhere to move."
 */
export function fear(over: Partial<SpellRecord> = {}): SpellRecord {
  return holdPerson({
    id: "srd_srd_fear", name: "Fear", level: 3, save_attribute: "WIS",
    condition_effect: holdPersonEffect({ conditions: ["Frightened"], repeat_save: null, must_flee: true }),
    ...over,
  });
}

/** A mage that lists Fear (3rd level, 3 slots): spell save DC 14. */
export function mageWithFear(): MonsterStatBlock {
  return mageBlock({
    special_abilities: [other(
      "Spellcasting",
      "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:\n\n* 3rd level (3 slots): fear",
    )],
  });
}

const healEffect = (dice: string, over: Partial<StructuredSpellEffect> = {}): StructuredSpellEffect => ({
  id: "base", phase: "impact", outcome: "automatic", target: { type: "creature", count: 1 }, kind: "healing", dice,
  multiplier: 1, damageType: null, condition: null, description: null, scaling: { mode: "slot", dice }, modifier: "spellcasting_ability", ...over,
});

/** A healing record as the library stores one: no attack, no save, no damage, one structured healing effect. */
function healer(over: Partial<SpellRecord>): SpellRecord {
  return {
    id: "heal", name: "Heal", level: 1, range: "Touch", ruleset: "2014", source: "srd-2014", concentration: false, attack_type: null,
    save_attribute: null, save_effect: null, damage_rolls: null, healing_dice: null, aoe_shape: null, aoe_size: null, higher_level_damage: null,
    mechanics_reviewed: true, effects: [], condition_effect: null, casting_time: "Action", casting_time_custom: null, ...over,
  };
}

/** The reviewed library rows of "Cure Wounds": 1d8 (2014) or 2d8 (2024) plus the spellcasting modifier, the same dice again per slot level above 1st; an Action, range Touch. */
export function cureWounds(over: Partial<SpellRecord> = {}): SpellRecord {
  const ruleset = over.ruleset ?? "2014";
  const dice = ruleset === "2024" ? "2d8" : "1d8";
  return healer({ id: `cure_wounds_${ruleset}`, name: "Cure Wounds", ruleset, healing_dice: dice, effects: [healEffect(dice)], ...over });
}

/** The library rows of "Healing Word": 1d4 (2014) or 2d4 (2024) plus the modifier; a Bonus Action (stored as "Special" and "bonus-action"), range 60 feet. */
export function healingWord(over: Partial<SpellRecord> = {}): SpellRecord {
  const ruleset = over.ruleset ?? "2014";
  const dice = ruleset === "2024" ? "2d4" : "1d4";
  return healer({
    id: `healing_word_${ruleset}`, name: "Healing Word", ruleset, range: "60 ft.", healing_dice: dice, effects: [healEffect(dice)],
    casting_time: "Special", casting_time_custom: "bonus-action", ...over,
  });
}

/** "Mass Healing Word" 2014: 1d4 plus the modifier for up to six creatures, a Bonus Action, 3rd level, +1d4 per level above. */
export function massHealingWord(over: Partial<SpellRecord> = {}): SpellRecord {
  return healer({
    id: "mass_healing_word_2014", name: "Mass Healing Word", level: 3, range: "60 ft.", healing_dice: "1d4",
    effects: [healEffect("1d4", { target: { type: "creature", count: 6 } })], casting_time: "Special", casting_time_custom: "bonus-action", ...over,
  });
}

/**
 * "Heal" as the library stores it: 70 hit points (a flat "70" in `dice`, no modifier), +10 per slot level above 6th, a 6th-level Action
 * at 60 feet. 2014 ends Blinded and Deafened and "diseases" (which the app has no condition for); 2024 ends Blinded, Deafened and Poisoned.
 */
export function heal(over: Partial<SpellRecord> = {}): SpellRecord {
  const ruleset = over.ruleset ?? "2014";
  const ends = ruleset === "2024" ? ["Blinded", "Deafened", "Poisoned"] : ["Blinded", "Deafened", "diseases"];
  return healer({
    id: `heal_${ruleset}`, name: "Heal", level: 6, range: "60 ft.", ruleset, healing_dice: null,
    effects: [healEffect("70", { modifier: null, scaling: { mode: "slot", dice: "10" }, ends, unaffected: [] })],
    ...over,
  });
}

/** "Mass Heal": a pool of 700 hit points shared among any number of creatures in range, a 9th-level Action, 60 feet. */
export function massHeal(over: Partial<SpellRecord> = {}): SpellRecord {
  const ruleset = over.ruleset ?? "2014";
  const ends = ruleset === "2024" ? ["Blinded", "Deafened", "Poisoned"] : ["Blinded", "Deafened", "diseases"];
  return healer({
    id: `mass_heal_${ruleset}`, name: "Mass Heal", level: 9, range: "60 ft.", ruleset, healing_dice: null,
    effects: [healEffect("", { dice: null, pool: 700, modifier: null, scaling: null, target: { type: "creature", count: null }, ends, unaffected: ruleset === "2014" ? ["undead", "construct"] : [] })],
    ...over,
  });
}

/** An acolyte-like cleric: Wisdom 16 (+3), spell save DC 13, 4 first-level slots for cure wounds and healing word, 2 third-level slots for mass healing word, a sacred flame cantrip. */
export function clericBlock(over: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return mageBlock({
    int: 10, wis: 16, challenge_rating: "2",
    special_abilities: [other(
      "Spellcasting",
      "The cleric is a 5th-level spellcaster. Its spellcasting ability is Wisdom (spell save DC 13, +5 to hit with spell attacks). The cleric has the following cleric spells prepared:\n\n* Cantrips (at will): sacred flame\n* 1st level (4 slots): cure wounds, healing word\n* 3rd level (2 slots): mass healing word",
    )],
    ...over,
  });
}
