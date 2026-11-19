import { sortCombatantsByInitiative } from "../../rules/combatantSort.ts";
import { isStanding } from "../../rules/fight/standing.ts";
import type { RunCombatant } from "../../types/encounter.types.ts";

/**
 * Who an attacker can pick: everyone else, the living before the dead,
 * opponents (another faction) before allies, then in initiative order.
 */
export function targetCandidates(attacker: RunCombatant, all: RunCombatant[]): RunCombatant[] {
  const order = new Map(sortCombatantsByInitiative(all).map((c, i) => [c.instance_id, i]));
  const rank = (c: RunCombatant) => (isStanding(c) ? 0 : 2) + (c.faction_id !== attacker.faction_id ? 0 : 1);
  const position = (c: RunCombatant) => order.get(c.instance_id) ?? 0;
  return all
    .filter((c) => c.instance_id !== attacker.instance_id)
    .sort((a, b) => rank(a) - rank(b) || position(a) - position(b));
}
