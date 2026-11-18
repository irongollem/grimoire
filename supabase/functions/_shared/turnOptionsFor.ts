// The whole-turn options of one creature, assembled from what a fight function has already read (#1202, #1203).
// Shared by `encounter-options` (which serves them as a read) and `encounter-command` (whose `take_turn` plays one), so
// the two can never disagree about what a creature may do. Pure: the database is the caller's business.

import { combatantSpeed } from "../../../src/lib/encounters/combatantSpeed.ts";
import { actionAvailability } from "../../../src/rules/encounterTurn.ts";
import type { FightMap } from "../../../src/rules/fight/terrain/battleMap.ts";
import { movementBudgetFeet } from "../../../src/rules/fight/terrain/movementBudget.ts";
import { DEFAULT_REACH_FEET } from "../../../src/rules/fight/terrain/sight.ts";
import { castableNow, type CastNow } from "../../../src/rules/fight/spells/castNow.ts";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice.ts";
import { turnOptions, type TurnOption, type UsableAttack } from "../../../src/rules/fight/terrain/turnOptions.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../src/types/monster.types.ts";
import type { RulesetKey } from "../../../src/types/ruleset.types.ts";
import { statBlockOf, type StatBlockSources } from "./fightStatBlocks.ts";

/**
 * A creature's melee reach in feet: the longest `reach` among the melee attacks (and melee-or-ranged ones) of its
 * Actions, else 5 ft. A player's is 5 ft too: the weapon's reach on the character sheet is not read.
 */
export function meleeReachFeet(block: MonsterStatBlock | null): number {
  if (block === null || !block.actions) return DEFAULT_REACH_FEET;
  const reaches = block.actions.flatMap((e) => {
    const a = e.structured.kind === "attack" ? e.structured.attack : undefined;
    if (!a || a.delivery === "ranged") return [];
    return [a.reach === undefined ? DEFAULT_REACH_FEET : a.reach];
  });
  return reaches.length === 0 ? DEFAULT_REACH_FEET : Math.max(...reaches);
}

/** The Actions and Bonus Actions the creature can use now: a spent recharge or a used-up N/day ability is left out. */
export function usableAttacks(mover: RunCombatant, block: MonsterStatBlock | null): UsableAttack[] {
  if (block === null) return [];
  const out: UsableAttack[] = [];
  for (const list of ["actions", "bonus_actions"] as const) {
    for (const entry of block[list] ?? []) {
      if (actionAvailability(mover, entry, list).available) out.push({ list, entry });
    }
  }
  return out;
}

export interface TurnOptionsFacts {
  combatants: readonly RunCombatant[];
  mover: RunCombatant;
  ruleset: RulesetKey;
  sources: StatBlockSources;
  /** The party members' sheet speeds; a creature with a stat block never reads one, so a caller that refuses players may pass none. */
  members: { id: string; speed: number }[];
  /** The fight's map, or null when it has none the rules can use. */
  map: FightMap | null;
  /**
   * The records of every spell the mover lists (`listedSpellNames`), read by the caller and only for a creature that
   * casts: left out, the creature is offered no spell. A caller that never offers spells (a read of the options) may leave it.
   */
  spellRecords?: readonly SpellRecord[];
}

/** The options as `turnOptions` composes them, before any gate or numbers. */
export function assembleTurnOptions(facts: TurnOptionsFacts): { options: TurnOption[]; attacks: UsableAttack[]; spells: CastNow[] } {
  const { mover, sources } = facts;
  const budgetFeet = movementBudgetFeet({
    speed: combatantSpeed(mover, { monsters: sources.monsters, npcs: sources.npcs, members: facts.members }),
    movementUsed: mover.movement_used,
    conditions: mover.conditions,
    ruleset: facts.ruleset,
  });
  const block = statBlockOf(mover, sources);
  const attacks = usableAttacks(mover, block);
  const spells = block === null || facts.spellRecords === undefined ? [] : castableNow(block, mover, facts.spellRecords, facts.ruleset);
  const options = turnOptions({
    combatants: facts.combatants,
    moverId: mover.instance_id,
    map: facts.map,
    budgetFeet,
    attacks,
    reachOf: (c) => meleeReachFeet(statBlockOf(c, sources)),
    ruleset: facts.ruleset,
    spells,
  });
  return { options, attacks, spells };
}
