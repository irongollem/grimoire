// The adjacent-enemy half of Sneak Attack's condition, one rule for the roll (`resolve_attack`) and for the tactics that weigh a
// swing by it (`withNumbers`), so the two can never disagree about when the dice apply.
// Pure and edge-importable (relative `.ts` imports only).

import type { RunCombatant } from "../../../types/encounter.types.ts";
import { isIncapacitated } from "../../conditions.ts";
import { sortCombatantsByInitiative } from "../../combatantSort.ts";
import { isHostileTo, type FactionSides } from "../sides.ts";
import { withinFiveFeet } from "../targeting.ts";

/**
 * RULE sneak-attack (PHB 2014 "Rogue: Sneak Attack"; PHB 2024 "Sneak Attack"): another enemy of the target stands within 5 feet of it
 * and is not incapacitated. That creature is not the attacker, is standing (a creature at 0 hit points is no threat to the target),
 * and is no bystander. Whether the attacker has disadvantage is the roll's own (`attackRollMode`), asked by the caller.
 */
export function enemyBesideTarget(combatants: readonly RunCombatant[], attackerId: string, target: RunCombatant, factions: FactionSides): boolean {
  return combatants.some((c) =>
    c.instance_id !== attackerId && c.instance_id !== target.instance_id && c.bystander !== true && c.hp > 0
    && !isIncapacitated(c.conditions) && isHostileTo(c, target, factions) && withinFiveFeet(c, target) === true);
}

/**
 * RULE sneak-attack-once-per-turn (PHB 2014 "Rogue: Sneak Attack" and PHB 2024 "Sneak Attack": "once per turn"): a turn is any
 * creature's, so a Rogue who used it on their own turn may use it again on a Reaction in a foe's turn. The tally key names the
 * fight's current turn, the round and the creature whose turn it is (`action_uses`, one use each), never the Rogue's own turns.
 */
export function sneakUseKey(fight: { round: number; activeIndex: number; combatants: readonly RunCombatant[] }): string {
  const active = sortCombatantsByInitiative(fight.combatants)[fight.activeIndex];
  return `sneak_attack/${fight.round}:${active === undefined ? `#${fight.activeIndex}` : active.instance_id}`;
}
