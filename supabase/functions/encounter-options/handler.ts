// encounter-options (#1202, story 3b): the whole-turn options of one creature in a live fight, as a read. Pure with
// the database injected: `computeOptions` gathers what the composer needs (the roster, the creature's stat block and
// speed, the map) through `OptionsDeps` and hands it to `turnOptions`. It writes nothing: no batch id, no version
// bump, and `OptionsDeps` has no way to.
//
// A creature with no stat block (a player character, a lost source) has no attacks to offer: it gets Dodge and the
// movement options only, because a player picks their own turn. Its speed is the character sheet's.

import { combatantSpeed } from "../../../src/lib/encounters/combatantSpeed.ts";
import { actionAvailability } from "../../../src/rules/encounterTurn.ts";
import { fightMapOf, type FightMapInput } from "../../../src/rules/fight/terrain/battleMap.ts";
import { movementBudgetFeet } from "../../../src/rules/fight/terrain/movementBudget.ts";
import { DEFAULT_REACH_FEET } from "../../../src/rules/fight/terrain/sight.ts";
import { turnOptions, type TurnOption, type UsableAttack } from "../../../src/rules/fight/terrain/turnOptions.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../src/types/monster.types.ts";
import type { RulesetKey } from "../../../src/types/ruleset.types.ts";
import { statBlockIdsOf, statBlockOf, type StatBlockSources } from "../_shared/fightStatBlocks.ts";

export const MAX_BODY_CHARACTERS = 2_000;

/** A refusal the caller can act on: the status says whose fault it is, the message says what to change. */
export class OptionsError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = "OptionsError";
  }
}

export interface OptionsRequest {
  encounterId: string;
  instanceId: string;
}

export function validateOptionsRequest(body: unknown): OptionsRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new OptionsError(400, "The request body must be an object.");
  const { encounterId, instanceId } = body as Record<string, unknown>;
  if (typeof encounterId !== "string" || encounterId.length === 0) throw new OptionsError(400, "encounterId is required.");
  if (typeof instanceId !== "string" || instanceId.length === 0) throw new OptionsError(400, "instanceId is required.");
  return { encounterId, instanceId };
}

/** The fight as the options read it: the row's version and roster, and the ruleset the campaign plays. */
export interface OptionsFight {
  version: number;
  combatants: RunCombatant[];
  ruleset: RulesetKey;
}

/** Reads only. Each is already bound to the encounter's campaign by the caller, and every query is scoped to it. */
export interface OptionsDeps {
  /** Null when the encounter has no saved fight yet. */
  loadFight(): Promise<OptionsFight | null>;
  loadStatBlocks(ids: { monsterIds: string[]; npcIds: string[]; companionIds: string[] }): Promise<StatBlockSources>;
  /** The party members' sheet speeds, by id. */
  loadMemberSpeeds(memberIds: string[]): Promise<{ id: string; speed: number }[]>;
  /** The inputs of the fight's map, or null when the encounter is anchored to no place. */
  loadMapInput(): Promise<FightMapInput | null>;
}

export interface OptionsResponse {
  /** The fight row's version the options were worked out against. */
  version: number;
  options: TurnOption[];
}

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
function usableAttacks(mover: RunCombatant, block: MonsterStatBlock | null): UsableAttack[] {
  if (block === null) return [];
  const out: UsableAttack[] = [];
  for (const list of ["actions", "bonus_actions"] as const) {
    for (const entry of block[list] ?? []) {
      if (actionAvailability(mover, entry, list).available) out.push({ list, entry });
    }
  }
  return out;
}

export async function computeOptions(request: OptionsRequest, deps: OptionsDeps): Promise<OptionsResponse> {
  const fight = await deps.loadFight();
  if (fight === null) throw new OptionsError(404, "This encounter has no saved fight yet.");
  const mover = fight.combatants.find((c) => c.instance_id === request.instanceId);
  if (!mover) throw new OptionsError(404, `No creature "${request.instanceId}" is in this fight.`);

  const sources = await deps.loadStatBlocks(statBlockIdsOf(fight.combatants));
  const memberIds = fight.combatants.flatMap((c) => (c.party_member_id ? [c.party_member_id] : []));
  const members = memberIds.length === 0 ? [] : await deps.loadMemberSpeeds(memberIds);
  const mapInput = await deps.loadMapInput();

  const budgetFeet = movementBudgetFeet({
    speed: combatantSpeed(mover, { monsters: sources.monsters, npcs: sources.npcs, members }),
    movementUsed: mover.movement_used,
    conditions: mover.conditions,
    ruleset: fight.ruleset,
  });
  const options = turnOptions({
    combatants: fight.combatants,
    moverId: mover.instance_id,
    map: mapInput === null ? null : fightMapOf(mapInput),
    budgetFeet,
    attacks: usableAttacks(mover, statBlockOf(mover, sources)),
    reachOf: (c) => meleeReachFeet(statBlockOf(c, sources)),
    ruleset: fight.ruleset,
  });
  return { version: fight.version, options };
}
