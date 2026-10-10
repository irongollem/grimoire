import type { ParsedExpression } from "@/lib/dice/dice";
import type { DamageType } from "@/types/damage.types";
import type { AttackStructure, DamagePart, SaveStructure, SrdConditionName } from "@/types/statBlock.types";
import { autoCritOnHit, resolveAttack } from "./attackRoll.ts";
import { autoFailsSave, resolveSave } from "./savingThrow.ts";
import { damageRollsFor } from "./typedDamage.ts";

/** Half damage rounds down (SRD "Damage Rolls"). */
export function halveDamage(amount: number): number {
  return Math.floor(amount / 2);
}

/**
 * Half of a multi-part damage roll, rounded down once over the whole roll
 * (SRD "Damage Rolls"), not once per part: 7 fire + 7 poison halves to 7.
 * Each part is halved down, then the points lost to rounding are handed back to
 * the parts that dropped the largest fraction (ties: the earlier part), so the
 * amounts sum to floor(total / 2) and every part keeps its type for defenses.
 */
export function halveParts<T extends { amount: number; type: DamageType | null }>(parts: T[]): T[] {
  const total = parts.reduce((n, p) => n + p.amount, 0);
  const halved = parts.map((p) => halveDamage(p.amount));
  let owed = halveDamage(total) - halved.reduce((n, a) => n + a, 0);
  // A dropped fraction is 0.5 for an odd part and 0 for an even one.
  for (let i = 0; i < parts.length && owed > 0; i++) {
    if (parts[i].amount % 2 === 1) {
      halved[i] += 1;
      owed -= 1;
    }
  }
  return parts.map((p, i) => ({ ...p, amount: halved[i] }));
}

export function resolveAttackAction(input: {
  attack: AttackStructure;
  d20: number;
  targetAc: number;
  targetConditions: string[];
  withinFiveFeet: boolean;
  penalty?: number;
}): { roll: ReturnType<typeof resolveAttack>; damageToRoll: Array<{ part: DamagePart; parsed: ParsedExpression }> | null } {
  const roll = resolveAttack({
    d20: input.d20,
    bonus: input.attack.bonus,
    targetAc: input.targetAc,
    penalty: input.penalty,
    autoCrit: autoCritOnHit(input.targetConditions, input.withinFiveFeet),
  });
  return { roll, damageToRoll: roll.hit ? damageRollsFor(input.attack.hit, roll.critical) : null };
}

export function resolveSaveAction(input: {
  save: SaveStructure;
  d20: number;
  saveBonus: number;
  targetConditions: string[];
  penalty?: number;
}): { roll: ReturnType<typeof resolveSave>; damageMultiplier: 1 | 0.5 | 0; conditionsImposed: SrdConditionName[] } {
  const { save } = input;
  const roll = resolveSave({
    d20: input.d20,
    bonus: input.saveBonus,
    dc: save.dc,
    penalty: input.penalty,
    autoFail: autoFailsSave(input.targetConditions, save.ability),
  });
  if (!roll.success) return { roll, damageMultiplier: 1, conditionsImposed: [...save.conditions] };
  return { roll, damageMultiplier: save.success === "half" ? 0.5 : 0, conditionsImposed: [] };
}
