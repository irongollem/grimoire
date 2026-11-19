import { NO_OCCLUDERS, type Occluders } from "@/lib/battlemap/occlusion";
import { rangedAttackFacts } from "@/rules/fight/terrain/sight";
import type { FactionSides } from "@/rules/fight/sides";
import type { RunCombatant } from "@/types/encounter.types";
import type { AttackStructure } from "@/types/statBlock.types";

/** What a ranged attack roll needs beyond "within 5 feet of the target" (`attackRollMode` takes both). */
export interface RangedFacts {
  hostileWithinFiveFeetOfAttacker: boolean;
  longRange: boolean;
}

const NONE: RangedFacts = { hostileWithinFiveFeetOfAttacker: false, longRange: false };

/**
 * The two ranged-attack facts for an attack the browser resolves itself (PHB 2014 ch. 9 "Ranged Attacks in Close
 * Combat" and "Long Range"), worked out the way the server does for a creature's attack: nothing for a melee blow,
 * the entry's range when it has one, and the map's walls as the map screen on show has read them
 * (`encounterRun.occluders`): with no map screen up there are none to read, and a hostile within 5 feet counts as
 * beside the attacker, as on open ground. A creature with no place on the map gives no facts.
 */
export function rangedFactsFor(input: {
  attacker: RunCombatant;
  target: RunCombatant;
  combatants: readonly RunCombatant[];
  factions: FactionSides;
  attack: Pick<AttackStructure, "range">;
  /** How the attack is made now: a melee-or-ranged attack is the one the caller chose. */
  delivery: "melee" | "ranged";
  /** The fight map's walls and closed doors, or null when none have been read. */
  occluders: Occluders | null;
}): RangedFacts {
  if (input.delivery !== "ranged") return NONE;
  return rangedAttackFacts({
    attacker: input.attacker,
    target: input.target,
    combatants: input.combatants,
    factions: input.factions,
    range: input.attack.range === undefined ? null : input.attack.range,
    occluders: input.occluders === null ? NO_OCCLUDERS : input.occluders,
  });
}
