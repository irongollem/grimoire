import { scaleExpression } from "@/lib/dice/dice";
import type { DamageRoll } from "@/lib/dice/dice";
import { cantripDiceMultiplier } from "@/types/spell.types";
import type { HigherLevelDamage, Spell } from "@/types/spell.types";

/**
 * A damage roll's dice at a higher slot. A spell with two damage parts (Ice Storm)
 * names the part that grows: "the bludgeoning damage increases by 1d8 ...", stored
 * as `higher_level_damage.type`. With no type every roll grows (one-part spells).
 */
export function slotScaledDamageDice(roll: DamageRoll, extraLevels: number, higher: HigherLevelDamage | null): string {
  if (extraLevels <= 0 || !higher) return roll.dice;
  if (higher.type && higher.type.trim().toLowerCase() !== roll.type.trim().toLowerCase()) return roll.dice;
  return scaleExpression(roll.dice, extraLevels, higher.dice_per_level);
}

/**
 * Every damage roll of one cast, at the slot it was cast with: a levelled spell grows
 * the part its upcast names, a cantrip multiplies its dice by the caster's level step.
 * The one rule the player sheet, the encounter runner and the upcast picker share, so
 * the same cast cannot roll differently depending on where it was cast from.
 */
export function castDamageRolls(
  spell: Pick<Spell, "level" | "damage_rolls" | "higher_level_damage">,
  castLevel: number,
  characterLevel: number,
): DamageRoll[] {
  const extraLevels = Math.max(0, castLevel - spell.level);
  const cantripMultiplier = spell.level === 0 ? cantripDiceMultiplier(characterLevel) : 1;
  return (spell.damage_rolls ?? []).map((roll) => ({
    ...roll,
    dice: cantripMultiplier > 1
      ? scaleExpression(roll.dice, cantripMultiplier - 1, roll.dice)
      : slotScaledDamageDice(roll, extraLevels, spell.higher_level_damage),
  }));
}
