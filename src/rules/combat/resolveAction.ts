import type { ParsedExpression } from "@/lib/dice/dice";
import type { AttackStructure, DamagePart, SaveStructure, SrdConditionName } from "@/types/statBlock.types";
import { autoCritOnHit, resolveAttack } from "./attackRoll.ts";
import { autoFailsSave, resolveSave } from "./savingThrow.ts";
import { damageRollsFor } from "./typedDamage.ts";

/** Half damage rounds down (SRD "Damage Rolls"). */
export function halveDamage(amount: number): number {
  return Math.floor(amount / 2);
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
