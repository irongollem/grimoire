// The two stances a creature takes with its Action and carries until its next turn begins: Dodging and Disengaged.
// They are ordinary conditions, so they ride the same lists, persist the same way and expire through the same
// turn-edge rule as any "until the start of your next turn" effect (`conditionsAtTurnEdge`).
//
// Pure and edge-importable (relative `.ts` imports only).

import type { AppliedCondition } from "../../types/condition.types.ts";
import { isIncapacitated } from "../conditions.ts";

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

// `isIncapacitated` lives in `../conditions.ts`; re-exported for callers that already import it from here.
export { isIncapacitated };

/**
 * Hidden: unseen and unheard after a successful Hide (PHB 2014 ch. 7 "Hiding" and ch. 9 "Unseen Attackers and
 * Targets"; SRD 5.2 "Hide [Action]", where a success gives the Invisible condition's effects). Unlike a stance it
 * does not run out with the turn: it ends when the hider attacks or is found.
 */
export const HIDDEN = "Hidden";

export function hiddenCondition(): AppliedCondition {
  return { name: HIDDEN };
}

export function isHidden(conditions: readonly AppliedCondition[]): boolean {
  return conditions.some((c) => c.name === HIDDEN);
}

/**
 * Whether the players' screens leave this combatant out (#1021 row 13, the maintainer's decision of 21 Nov 2026): a creature
 * that took the Hide action and has not been found has no known place, so neither its token nor its row is shown to them. A
 * party member who hides stays: the players are on its side. The server's player projection applies the same rule
 * (supabase/migrations/20261120230833_hidden_creatures_leave_the_players_view.sql). The DM sees it.
 */
export function hiddenFromPlayers(c: { type: string; conditions: readonly AppliedCondition[] }): boolean {
  return c.type !== "player" && isHidden(c.conditions);
}
