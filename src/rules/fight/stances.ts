// The two stances a creature takes with its Action and carries until its next turn begins: Dodging and Disengaged.
// They are ordinary conditions, so they ride the same lists, persist the same way and expire through the same
// turn-edge rule as any "until the start of your next turn" effect (`conditionsAtTurnEdge`).
//
// Pure and edge-importable (relative `.ts` imports only).

import type { AppliedCondition } from "../../types/condition.types.ts";

/**
 * PHB 2014 ch. 9 "Dodge"; SRD 5.2 "Dodge [Action]": until the start of its next turn, attacks against the creature
 * have disadvantage if it can see the attacker, and it has advantage on Dexterity saving throws. Both are lost if
 * it is Incapacitated. The effects live in `attackRollMode` and `saveRollMode`.
 */
export const DODGING = "Dodging";

/**
 * PHB 2014 ch. 9 "Disengage"; SRD 5.2 "Disengage [Action]": the creature's movement does not provoke opportunity
 * attacks for the rest of the turn. A turn ends before its next one begins, so the same expiry serves.
 */
export const DISENGAGED = "Disengaged";

const UNTIL_NEXT_TURN_STARTS = { kind: "turn", at: "start", of: "self" } as const;

/** The Dodge action's condition on its bearer. */
export function dodgingCondition(): AppliedCondition {
  return { name: DODGING, ends: UNTIL_NEXT_TURN_STARTS };
}

/** The Disengage action's condition on its bearer. */
export function disengagedCondition(): AppliedCondition {
  return { name: DISENGAGED, ends: UNTIL_NEXT_TURN_STARTS };
}

export function isDodging(conditions: readonly AppliedCondition[]): boolean {
  return conditions.some((c) => c.name === DODGING);
}

export function isDisengaged(conditions: readonly AppliedCondition[]): boolean {
  return conditions.some((c) => c.name === DISENGAGED);
}

/**
 * Conditions that include Incapacitated (PHB 2014 / SRD 5.2 "Conditions": Paralyzed, Petrified, Stunned and
 * Unconscious each say "incapacitated"). An incapacitated creature cannot take actions or reactions, and the Dodge
 * stance gives it nothing.
 */
const INCAPACITATING = new Set<string>(["Incapacitated", "Paralyzed", "Petrified", "Stunned", "Unconscious"]);

/** The creature is Incapacitated, by that name or by a condition that includes it. */
export function isIncapacitated(conditions: readonly AppliedCondition[]): boolean {
  return conditions.some((c) => INCAPACITATING.has(c.name));
}
