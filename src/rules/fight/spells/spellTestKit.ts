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
 * effect. `only_kinds` is empty here because the fight cannot read a creature's kind (see `conditionsOf`); the real agreed
 * reading says "humanoid".
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
