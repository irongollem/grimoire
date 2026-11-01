/**
 * Curated spell mechanics (#1123 follow-up). Some library spells state their
 * roll plainly in wording no sentence template reads. A curated entry records
 * that roll (two independent extractions agreed on it); `storedMechanicsFor`
 * turns it into the exact columns the resolver and the checker's existing
 * bases expect, and `checkSpellMechanics` approves a row only when its stored
 * columns equal that conversion and the entry survives the text sanity checks.
 */
import type { DamageRoll } from "@/lib/dice/dice";
import { normDice } from "@/lib/library/spellTextMechanics";
import type { HigherLevelDamage, SpellEffectInstances, StructuredSpellEffect } from "@/types/spell.types";

export type CuratedResolution = "attack_melee" | "attack_ranged" | "save" | "automatic" | "weapon_rider";

export interface CuratedRoll {
  kind: "damage" | "healing";
  resolution: CuratedResolution;
  save_ability: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA" | null;
  save_half: boolean | null;
  parts: Array<{ dice: string; type: string | null }>;
  type_choices: string[] | null;
  adds_spellcasting_modifier: boolean;
  instances: { noun: string; count: number; per_slot_above: number } | null;
  upcast: { dice_per_level: string; part_type: string | null } | null;
  cantrip_scaling: boolean;
}

export type CuratedCategory =
  | "summon" | "random_table" | "over_turns" | "area_entry" | "later_bonus" | "self_damage" | "varies_by_outcome"
  | "several_damage_clauses" | "conditional_extra" | "no_damage_or_healing" | "other";

export interface CuratedSpellMechanics {
  verdict: "roll" | "not_one_roll";
  category: CuratedCategory | null;
  roll: CuratedRoll | null;
  /** One sentence copied word for word from the description. */
  evidence: string;
}

export type CuratedSpellMechanicsFile = Record<string, CuratedSpellMechanics>;

/** The eight columns the converter produces; exactly what the apply script writes. */
export interface StoredSpellMechanics {
  attack_type: string | null;
  save_attribute: string | null;
  save_effect: string | null;
  damage_rolls: DamageRoll[] | null;
  healing_dice: string | null;
  higher_level_damage: HigherLevelDamage | null;
  higher_level_healing: string | null;
  effects: StructuredSpellEffect[];
}

const ATTACK_TYPE: Record<CuratedResolution, string | null> = {
  attack_melee: "melee_spell",
  attack_ranged: "ranged_spell",
  save: "save",
  automatic: "automatic",
  weapon_rider: null,
};

/** "1d10" at a cantrip's character level 11 is "3d10"; a flat modifier stays. */
function multiplyDice(dice: string, factor: number): string {
  const match = normDice(dice).match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error(`Cannot scale ${dice} for a cantrip.`);
  return `${Number(match[1]) * factor}d${match[2]}${match[3] ?? ""}`;
}

/** Throws when the entry asks for something the effect model cannot hold. */
export function storedMechanicsFor(
  entry: CuratedSpellMechanics,
  spell: { level: number },
): StoredSpellMechanics {
  const roll = entry.roll;
  if (entry.verdict !== "roll" || !roll) throw new Error("Only a roll entry has stored mechanics.");
  const { resolution } = roll;
  const healing = roll.kind === "healing";
  const parts = roll.parts.map((p) => ({ dice: normDice(p.dice), type: p.type === null ? null : p.type.toLowerCase() }));
  if (parts.length < 1 || parts.length > 2) throw new Error("An entry has one or two parts.");
  const choices = roll.type_choices && roll.type_choices.length > 0 ? roll.type_choices.map((t) => t.toLowerCase()) : null;
  const dicePerLevel = roll.upcast ? normDice(roll.upcast.dice_per_level) : null;
  const partType = roll.upcast?.part_type ? roll.upcast.part_type.toLowerCase() : null;

  const higher_level_damage: HigherLevelDamage | null = !healing && dicePerLevel ? { dice_per_level: dicePerLevel, type: partType } : null;
  const higher_level_healing = healing && dicePerLevel ? dicePerLevel : null;

  if (resolution === "weapon_rider") {
    if (healing || parts.length !== 1 || choices || roll.instances || roll.cantrip_scaling) throw new Error("A weapon rider is one typed damage roll.");
    return {
      attack_type: null, save_attribute: null, save_effect: null,
      damage_rolls: [{ dice: parts[0].dice, type: parts[0].type ?? "" }],
      healing_dice: null, higher_level_damage, higher_level_healing: null, effects: [],
    };
  }
  if (healing && (resolution !== "automatic" || parts.length !== 1)) throw new Error("Healing is one automatic roll.");
  const two = parts.length === 2;
  if (two && (choices || roll.instances || roll.cantrip_scaling)) throw new Error("Two parts take no choices, instances or cantrip scaling.");
  if (roll.instances && (roll.cantrip_scaling || resolution === "save")) throw new Error("Instances belong to a single attack or automatic roll.");
  if (roll.cantrip_scaling && spell.level !== 0) throw new Error("Only a cantrip scales by character level.");
  if (roll.cantrip_scaling && roll.save_half) throw new Error("A cantrip with a save-for-half has no variant model.");
  let scaledIndex = 0;
  if (dicePerLevel && two) {
    const named = parts.findIndex((p) => p.type === partType);
    if (!partType || named < 0) throw new Error("An upcast on two parts must name the part.");
    scaledIndex = named;
  }

  const outcome = resolution === "save" ? "failed_save" : resolution === "automatic" ? "automatic" : "hit";
  const makeBase = (index: number): StructuredSpellEffect => ({
    id: index === 0 ? "base" : "base-2",
    phase: "impact",
    outcome,
    target: { type: null, count: null },
    kind: roll.kind,
    dice: parts[index].dice,
    multiplier: 1,
    damageType: healing || choices ? null : parts[index].type,
    condition: null,
    description: null,
    scaling: dicePerLevel && index === scaledIndex ? { mode: "slot", dice: dicePerLevel } : null,
    modifier: index === 0 && roll.adds_spellcasting_modifier ? "spellcasting_ability" : null,
    ...(choices ? { damageTypeChoices: choices } : {}),
  });
  const effects: StructuredSpellEffect[] = [];
  parts.forEach((_, index) => {
    const base = makeBase(index);
    effects.push(base);
    if (roll.save_half && resolution === "save") {
      effects.push({ ...base, id: `${base.id}-save-half`, outcome: "successful_save", multiplier: 0.5 });
    }
  });
  if (roll.instances) {
    const instances: SpellEffectInstances = { noun: roll.instances.noun, count: roll.instances.count };
    if (roll.instances.per_slot_above > 0) instances.perSlotAbove = roll.instances.per_slot_above;
    effects[0] = { ...effects[0], instances };
  }
  if (roll.cantrip_scaling) {
    [5, 11, 17].forEach((interval, index) => {
      const dice = multiplyDice(parts[0].dice, index + 2);
      effects.push({ ...effects[0], id: `option-${index}`, dice, scaling: { mode: "character_level", interval, dice } });
    });
  }

  return {
    attack_type: ATTACK_TYPE[resolution],
    save_attribute: resolution === "save" ? roll.save_ability : null,
    save_effect: resolution === "save" ? (roll.save_half ? "half" : "negates") : null,
    damage_rolls: healing ? null : parts.map((p) => ({ dice: p.dice, type: choices ? "" : (p.type ?? "") })),
    healing_dice: healing ? parts[0].dice : null,
    higher_level_damage,
    higher_level_healing,
    effects,
  };
}
