// encounter-options (#1202, story 3b): the whole-turn options of one creature in a live fight, as a read. Pure with
// the database injected: `computeOptions` gathers what the composer needs (the roster, the creature's stat block and
// speed, the map) through `OptionsDeps` and hands it to `turnOptions`. It writes nothing: no batch id, no version
// bump, and `OptionsDeps` has no way to.
//
// A creature with no stat block (a player character, a lost source) has no attacks to offer: it gets Dodge and the
// movement options only, because a player picks their own turn. Its speed is the character sheet's.

import type { FactionSides } from "../../../src/rules/fight/sides.ts";
import { fightMapOf, type FightMapInput } from "../../../src/rules/fight/terrain/battleMap.ts";
import type { TurnOption } from "../../../src/rules/fight/terrain/options/types.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { RulesetKey } from "../../../src/types/ruleset.types.ts";
import type { PartyIngestRow } from "../../../src/rules/fight/partyIngest.ts";
import { startedFromRound, type FightState } from "../../../src/rules/fight/fightState.ts";
import { ingestPartyRows, partyMemberIdsOf } from "../_shared/fightPartyIngest.ts";
import { statBlockIdsOf, statBlockOf, type StatBlockSources } from "../_shared/fightStatBlocks.ts";
import { ALLY_NEVER_OFFERED } from "../../../src/rules/fight/allies/profile.ts";
import { allyStatBlock } from "../../../src/rules/fight/allies/statBlock.ts";
import type { PlayerSheets } from "../../../src/rules/fight/playerSheet.ts";
import { assembleTurnOptions } from "../_shared/turnOptionsFor.ts";
import { listedSpellNames } from "../../../src/rules/fight/spells/castNow.ts";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice.ts";

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
  /** The encounter's factions: who fights whom (`src/rules/fight/sides.ts`). */
  factions: FactionSides;
  /** The fight's round, so the options shown match the turn the server would take (surprise, round 1). */
  round: number;
  /** Whether the players' screens are in this fight (the lobby included): the row's `is_running`. */
  live: boolean;
}

/** Reads only. Each is already bound to the encounter's campaign by the caller, and every query is scoped to it. */
export interface OptionsDeps {
  /** Null when the encounter has no saved fight yet. */
  loadFight(): Promise<OptionsFight | null>;
  /** The players' own rows (hit points, conditions ...), applied to the in-memory fight the way a command applies them. Read only. */
  loadPartyRows(memberIds: string[]): Promise<PartyIngestRow[]>;
  loadStatBlocks(ids: { monsterIds: string[]; npcIds: string[]; companionIds: string[] }): Promise<StatBlockSources>;
  /** The party members' sheet speeds, by id. */
  loadMemberSpeeds(memberIds: string[]): Promise<{ id: string; speed: number }[]>;
  /** The sheets of these party members, as `take_turn` reads them: an ally the server plays is seen through a stat block made from one (#1021). */
  loadPlayerSheets(memberIds: string[]): Promise<PlayerSheets>;
  /** The inputs of the fight's map, or null when the encounter is anchored to no place. */
  loadMapInput(): Promise<FightMapInput | null>;
  /** The records of the spells a creature's stat block lists, by name. Called only for a creature that lists any. */
  loadSpellsListed(names: string[]): Promise<SpellRecord[]>;
}

export interface OptionsResponse {
  /** The fight row's version the options were worked out against. */
  version: number;
  options: TurnOption[];
}

/** The fight's roster with its players' own rows applied. A copy: the fight as loaded is never changed. */
async function withPartyRows(fight: OptionsFight, deps: OptionsDeps): Promise<RunCombatant[]> {
  // Only what the ingest needs of a fight: no event or lair is in play, so none can fire from an adopted hit point.
  const state: FightState = {
    combatants: fight.combatants,
    round: fight.round,
    activeIndex: 0,
    started: startedFromRound(fight.round),
    randomizeInitiativeEachRound: false,
    ruleset: fight.ruleset,
    lairEnabled: false,
    lairOwnerInstanceId: null,
    lairFiredRounds: [],
    events: [],
    eventsFired: [],
  };
  const memberIds = partyMemberIdsOf(state);
  if (memberIds.length === 0) return fight.combatants;
  return ingestPartyRows(state, await deps.loadPartyRows(memberIds), fight.live, { monsters: [], npcs: [] }).state.combatants;
}

export async function computeOptions(request: OptionsRequest, deps: OptionsDeps): Promise<OptionsResponse> {
  const fight = await deps.loadFight();
  if (fight === null) throw new OptionsError(404, "This encounter has no saved fight yet.");

  // What the players changed on their own sheets comes first, as it does before a command, so the options are worked out
  // on the hit points the turn would be played on. Applied to this in-memory copy only: nothing is saved or written.
  const combatants = await withPartyRows(fight, deps);
  const mover = combatants.find((c) => c.instance_id === request.instanceId);
  if (!mover) throw new OptionsError(404, `No creature "${request.instanceId}" is in this fight.`);

  const loaded = await deps.loadStatBlocks(statBlockIdsOf(combatants));
  // A party member is listed the way `take_turn` plays them (#1021): through the block their own sheet makes, and never
  // offered a flee. Nobody else's options change.
  const ally = mover.type === "player" && mover.party_member_id !== undefined;
  const allyBlock = ally ? allyStatBlock(await deps.loadPlayerSheets([mover.party_member_id as string]), mover.party_member_id as string) : null;
  const sources: StatBlockSources = allyBlock === null ? loaded : { ...loaded, allies: { ...loaded.allies, [mover.party_member_id as string]: allyBlock } };
  const memberIds = combatants.flatMap((c) => (c.party_member_id ? [c.party_member_id] : []));
  const members = memberIds.length === 0 ? [] : await deps.loadMemberSpeeds(memberIds);
  const mapInput = await deps.loadMapInput();

  // The same casts `take_turn` weighs (#1021): a list that left them out would show a DM a turn the creature does not take.
  const block = statBlockOf(mover, sources);
  const listed = block ? listedSpellNames(block) : [];
  const spellRecords = listed.length === 0 ? [] : await deps.loadSpellsListed(listed);

  const assembled = assembleTurnOptions({
    combatants,
    mover,
    ruleset: fight.ruleset,
    sources,
    members,
    map: mapInput === null ? null : fightMapOf(mapInput),
    factions: fight.factions,
    round: fight.round,
    spellRecords,
  });
  const options = allyBlock === null ? assembled.options : assembled.options.filter((o) => !ALLY_NEVER_OFFERED.includes(o.kind));
  return { version: fight.version, options };
}
