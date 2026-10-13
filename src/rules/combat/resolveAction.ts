import type { ParsedExpression } from "@/lib/dice/dice";
import type { AppliedCondition, ConditionEnds, ConditionSource } from "@/types/condition.types";
import type { DamageType } from "@/types/damage.types";
import type { AttackStructure, DamagePart, SaveCondition, SaveStructure } from "@/types/statBlock.types";
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
  targetConditions: readonly AppliedCondition[];
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
  targetConditions: readonly AppliedCondition[];
  penalty?: number;
}): { roll: ReturnType<typeof resolveSave>; damageMultiplier: 1 | 0.5 | 0; conditionsImposed: SaveCondition[] } {
  const { save } = input;
  const roll = resolveSave({
    d20: input.d20,
    bonus: input.saveBonus,
    dc: save.dc,
    penalty: input.penalty,
    autoFail: autoFailsSave(input.targetConditions, save.ability),
  });
  if (!roll.success) return { roll, damageMultiplier: 1, conditionsImposed: save.conditions.map((c) => ({ ...c })) };
  return { roll, damageMultiplier: save.success === "half" ? 0.5 : 0, conditionsImposed: [] };
}

/**
 * A condition a failed save imposes, as the runner records it: who applied it and
 * with what (#1018), and what ends it (#1050). Each condition carries its own end
 * (#1055), so one save can end Restrained on a repeat save and leave Frightened
 * on its minute. A save-ends repeat of this same save takes the save's ability and
 * DC here rather than carrying copies; a round cap (`remaining`) rides along only
 * when the condition states one.
 */
export function imposedCondition(save: SaveStructure, condition: SaveCondition, source: ConditionSource): AppliedCondition {
  const authored = condition.ends;
  const ends: ConditionEnds | undefined =
    authored?.kind === "save"
      ? {
          kind: "save",
          ability: authored.ability ?? save.ability,
          dc: authored.dc ?? save.dc,
          at: authored.at,
          ...(authored.remaining !== undefined ? { remaining: authored.remaining } : {}),
        }
      : authored && { ...authored };
  return { name: condition.name, source, ...(ends ? { ends } : {}) };
}
