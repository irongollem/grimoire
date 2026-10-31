import { scaleExpression } from "@/lib/dice/dice";
import type { DamageRoll } from "@/lib/dice/dice";
import type { HigherLevelDamage } from "@/types/spell.types";

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
