// A fight advanced by the server (#1201, stage 1c). Pure with effects injected:
// `index.ts` wires the database in, the tests wire in a fake store with the same
// version rule.
//
// The rule that makes this safe with several writers (the DM's browser, a second
// device, an AI table master): a fight row carries a `version` the database raises
// on every update, and a batch is saved only `where version = the one it loaded`.
// A writer that lost the race loads the fresh row and works out its commands again
// on top of what the winner wrote, so neither change is lost. The effects (a
// player's own row, a chat line) are performed only after the save that decided
// them, so a lost race never leaves a half-announced fight behind.

import type { EncounterEvent, RunCombatant } from "../../../src/types/encounter.types.ts";
import type { PartyMemberUpdate } from "../../../src/types/party.types.ts";
import type { ExploreParty } from "../../../src/types/exploreParty.types.ts";
import type { AppliedCondition } from "../../../src/types/condition.types.ts";
import { spellKey } from "../../../src/rules/fight/spells/castLimit.ts";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice.ts";
import type { RulesetKey } from "../../../src/types/ruleset.types.ts";
import type { Monster } from "../../../src/types/monster.types.ts";
import type { NpcListRow } from "../../../src/types/npc.types.ts";
import type { EncounterTurnCommand } from "../../../src/rules/encounterTurn.ts";
import { isShownDefense } from "../../../src/rules/fight/tactics/shownDefenses.ts";
import { isShownDeedDelta } from "../../../src/rules/fight/tactics/shownThreat.ts";
import { applyFightCommand, FIGHT_OWN_COMMAND_TYPES, type FightCommand } from "../../../src/rules/fight/fightCommands.ts";
import type { FightDeps } from "../../../src/rules/fight/fightEvents.ts";
import { ingestPartyRow, type PartyIngestRow } from "../../../src/rules/fight/partyIngest.ts";
import { endOfFightPatches } from "../../../src/rules/fight/fightEnd.ts";
import { startedFromRound, type FightEffect, type FightState } from "../../../src/rules/fight/fightState.ts";
import type { PlayerSheets } from "../../../src/rules/fight/playerSheet.ts";
import type { FightMap } from "../../../src/rules/fight/terrain/battleMap.ts";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe.ts";
import { FightCommandError } from "./commandError.ts";
import { applyProvoke, isProvokeCommand, validateProvokeCommand, type ProvokeCommand } from "./opportunity.ts";
import { applyTakeTurn, isTakeTurnCommand, validateTakeTurnCommand, type TakeTurnCommand } from "./takeTurn.ts";
import {
  applyResolvingCommand,
  isResolvingCommand,
  statBlockIdsOf,
  validateResolvingCommand,
  type PostedRoll,
  type ResolveEnv,
  type ResolvingCommand,
  type StatBlockSources,
} from "./resolve.ts";

export { FightCommandError };
export type { TakeTurnCommand };
export { ALL_RESOLVING_COMMANDS_LISTED, RESOLVING_COMMAND_TYPES, type ResolvingCommand, type PostedRoll, type StatBlockSources } from "./resolve.ts";

export const MAX_COMMANDS = 50;
export const MAX_BATCH_ID_LENGTH = 80;
export const MAX_BODY_CHARACTERS = 200_000;
/** A retry comes within moments, so only the newest ids are worth keeping. */
export const APPLIED_IDS_KEPT = 64;
export const MAX_ATTEMPTS = 4;

/** Every command type the turn reducer takes. The check below fails the build when the union grows and this list does not. */
const REDUCER_COMMAND_TYPES = [
  "start_combat", "next_turn", "prev_turn", "reshuffle_initiative", "set_initiative", "adjust_hp", "set_hp", "set_max_hp",
  "set_temp_hp", "apply_condition", "remove_condition", "set_conditions", "resolve_condition_save", "settle_ongoing_damage",
  "end_concentration", "start_concentration", "enter_wildshape", "revert_wildshape", "set_size_override", "toggle_surprised", "toggle_reaction", "set_reaction_used",
  "record_move", "undo_move", "set_action_used", "set_bonus_used", "prime_legendary_actions", "spend_legendary_actions",
  "mark_lair_fired", "set_boss_mechanics", "remove_combatant", "use_action", "restore_action",
] as const satisfies readonly EncounterTurnCommand["type"][];

type MissingCommandTypes = Exclude<EncounterTurnCommand["type"], (typeof REDUCER_COMMAND_TYPES)[number]>;
// Compile-time only: a reducer command missing from the list makes this `never` unassignable from `true`.
export const ALL_REDUCER_COMMANDS_LISTED: [MissingCommandTypes] extends [never] ? true : never = true;

// The fight's own commands (curses, reveal state, joining, stat adoption, events) come from the engine's list,
// itself held equal to its union at compile time, so a new fight command is accepted here without a second list.
const ACCEPTED_TYPE_SET: ReadonlySet<string> = new Set<string>([...REDUCER_COMMAND_TYPES, ...FIGHT_OWN_COMMAND_TYPES]);

type MissingFightTypes = Exclude<FightCommand["type"], (typeof REDUCER_COMMAND_TYPES)[number] | (typeof FIGHT_OWN_COMMAND_TYPES)[number]>;
// Compile-time only: a fight command accepted by the engine but missing from both lists makes this `never` unassignable from `true`.
export const ALL_FIGHT_COMMANDS_LISTED: [MissingFightTypes] extends [never] ? true : never = true;

/** A bare party sync: the server loads the players' rows itself, so it is not an engine command and is sent alone. */
export type SyncPartyCommand = { type: "sync_party" };
/**
 * The lifecycle of a fight (#1201 stage 2): what the runner's Go Live, End combat and Abandon write, and the opening of a
 * run. Each is sent alone, because each decides which rows of other tables are touched and a mixed batch would have to
 * say in what order.
 */
export type LifecycleCommand =
  /** The caller builds the first roster: building it needs the character-sheet rules (armour class from gear, species, feats), which run in the browser. */
  | { type: "open"; combatants: RunCombatant[]; legendaryCaps?: Record<string, number> }
  /** The session is started (and announced) by the browser, which hands over its id. */
  | { type: "go_live"; sessionId: string | null }
  /** `siteId` is the site the fight is anchored in, resolved by the caller through the map stack; the server only checks it is this campaign's place. */
  | { type: "end_combat"; siteId?: string | null }
  | { type: "abandon" }
  /** The DM turns Go Live off: the players' screens leave the fight, which goes on. Nothing else about it changes. */
  | { type: "go_private" };
export const LIFECYCLE_TYPES: ReadonlySet<string> = new Set(["open", "go_live", "end_combat", "abandon", "go_private"]);
export type BatchCommand = FightCommand | SyncPartyCommand | LifecycleCommand | ResolvingCommand | TakeTurnCommand | ProvokeCommand;

export const MAX_ADDED_COMBATANTS = 30;
export const MAX_OPENED_COMBATANTS = 60;
const REVEAL_STATES: ReadonlySet<unknown> = new Set(["hidden", "unseen", "revealed"]);

export interface CommandRequest {
  encounterId: string;
  batchId: string;
  commands: BatchCommand[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A list of combatants a caller built: the fields a crash would follow are checked, the rest is the reducer's business. */
function validateCombatants(commandType: string, list: unknown, limit: number): void {
  if (!Array.isArray(list) || list.length < 1 || list.length > limit) {
    throw new FightCommandError(400, `${commandType} needs between 1 and ${limit} combatants.`);
  }
  for (const c of list) {
    if (
      !isRecord(c) || typeof c.instance_id !== "string" || c.instance_id.length === 0 || (c.type !== "player" && c.type !== "monster")
      || typeof c.name !== "string" || typeof c.hp !== "number" || typeof c.max_hp !== "number"
    ) {
      throw new FightCommandError(400, "Every combatant needs an instance_id, a type of player or monster, a name, hp and max_hp.");
    }
  }
}

function validateLifecycleCommand(command: Record<string, unknown>): void {
  switch (command.type) {
    case "open": {
      validateCombatants("open", command.combatants, MAX_OPENED_COMBATANTS);
      const caps = command.legendaryCaps;
      if (caps !== undefined && (!isRecord(caps) || Object.values(caps).some((n) => typeof n !== "number"))) {
        throw new FightCommandError(400, "legendaryCaps must map instance ids to numbers.");
      }
      break;
    }
    case "go_live":
      if (command.sessionId !== null && typeof command.sessionId !== "string") throw new FightCommandError(400, "go_live needs a sessionId, or null.");
      break;
    case "end_combat":
      if (command.siteId !== undefined && command.siteId !== null && typeof command.siteId !== "string") {
        throw new FightCommandError(400, "end_combat takes a siteId or none.");
      }
      break;
  }
}

/** The fight's own commands read strings and arrays the reducer's never do, so the ones a crash would follow are checked here. */
function validateOwnCommand(command: Record<string, unknown>): void {
  switch (command.type) {
    case "fire_event":
      if (typeof command.eventId !== "string" || command.eventId.length === 0) throw new FightCommandError(400, "fire_event needs an eventId.");
      break;
    case "add_curse":
    case "remove_curse":
      if (typeof command.instanceId !== "string" || typeof command.curse !== "string") {
        throw new FightCommandError(400, `${command.type} needs an instanceId and a curse.`);
      }
      break;
    case "set_reveal_state":
      if (typeof command.instanceId !== "string" || !REVEAL_STATES.has(command.revealState)) {
        throw new FightCommandError(400, "set_reveal_state needs an instanceId and a revealState.");
      }
      break;
    case "start_concentration":
      // A reducer command, checked here because it writes a name the runner shows and a level the save reads.
      if (typeof command.instanceId !== "string" || typeof command.spell !== "string" || command.spell.trim().length === 0 || command.spell.length > 120
        || !Number.isInteger(command.castLevel) || (command.castLevel as number) < 0 || (command.castLevel as number) > 9) {
        throw new FightCommandError(400, "start_concentration needs an instanceId, a spell name and a castLevel from 0 to 9.");
      }
      break;
    case "show_defense":
      if (typeof command.instanceId !== "string" || typeof command.damageType !== "string" || !isShownDefense(command.defense)) {
        throw new FightCommandError(400, "show_defense needs an instanceId, a damageType and a defense.");
      }
      break;
    case "show_deed":
      if (typeof command.instanceId !== "string" || !isShownDeedDelta(command.deed)) {
        throw new FightCommandError(400, "show_deed needs an instanceId and a deed of non-negative numbers.");
      }
      break;
    case "adopt_stats":
      if (typeof command.instanceId !== "string" || !isRecord(command.stats)) throw new FightCommandError(400, "adopt_stats needs an instanceId and stats.");
      break;
    case "add_combatants":
      validateCombatants("add_combatants", command.combatants, MAX_ADDED_COMBATANTS);
      break;
  }
}

/** Shape check only: deep fields are the reducer's business, it ignores what it cannot find. */
export function validateRequest(body: unknown): CommandRequest {
  if (!isRecord(body)) throw new FightCommandError(400, "The request body must be an object.");
  if (JSON.stringify(body).length > MAX_BODY_CHARACTERS) throw new FightCommandError(400, "The request is too large.");
  const { encounterId, batchId, commands } = body;
  if (typeof encounterId !== "string" || encounterId.length === 0) throw new FightCommandError(400, "encounterId is required.");
  if (typeof batchId !== "string" || batchId.length === 0 || batchId.length > MAX_BATCH_ID_LENGTH) {
    throw new FightCommandError(400, `batchId is required and at most ${MAX_BATCH_ID_LENGTH} characters.`);
  }
  if (!Array.isArray(commands) || commands.length < 1 || commands.length > MAX_COMMANDS) {
    throw new FightCommandError(400, `Send between 1 and ${MAX_COMMANDS} commands.`);
  }
  for (const command of commands) {
    if (!isRecord(command) || typeof command.type !== "string") throw new FightCommandError(400, "Every command needs a type.");
    if (command.type === "sync_party") {
      if (commands.length !== 1) throw new FightCommandError(400, "sync_party is sent alone.");
    } else if (LIFECYCLE_TYPES.has(command.type)) {
      if (commands.length !== 1) throw new FightCommandError(400, `${command.type} is sent alone.`);
      validateLifecycleCommand(command);
    } else if (isTakeTurnCommand(command as { type: string })) {
      // The server's own turn is worked out from the fight as it stands, so nothing is sent beside it.
      if (commands.length !== 1) throw new FightCommandError(400, "take_turn is sent alone.");
      validateTakeTurnCommand(command);
    } else if (isProvokeCommand(command as { type: string })) {
      // Like take_turn it reads the fight as it stands, so nothing is sent beside it.
      if (commands.length !== 1) throw new FightCommandError(400, "provoke is sent alone.");
      validateProvokeCommand(command);
    } else if (isResolvingCommand(command as { type: string })) {
      // Resolving commands mix with ordinary ones in a batch, and are applied in order with them.
      validateResolvingCommand(command);
    } else if (!ACCEPTED_TYPE_SET.has(command.type)) {
      throw new FightCommandError(400, `Unknown command type: ${command.type}.`);
    } else {
      validateOwnCommand(command);
    }
  }
  // The checks above proved the shape the type describes; deep fields are the reducer's to read.
  return { encounterId, batchId, commands: commands as BatchCommand[] };
}

/** The live row, as far as a batch reads it. */
export interface FightRow {
  id: string;
  version: number;
  combatants_live: RunCombatant[];
  current_round: number;
  active_combatant_index: number;
  events_fired: string[];
  lair_fired_rounds: number[];
  applied_command_ids: string[];
  /** Only whether the players' screens are in this fight; a saved fight that is not shown to them is still a fight. */
  is_running: boolean;
  /** When End combat or Abandon closed the fight; null while it is being set up or played. */
  ended_at: string | null;
}

/** Everything a batch needs besides the row: the encounter's own settings and what its spawns are built from. */
export interface LoadedFight {
  /** Null when the encounter has no saved fight yet: only `open` can make one. */
  row: FightRow | null;
  events: EncounterEvent[];
  lairEnabled: boolean;
  lairOwnerDefId: string | null;
  ruleset: RulesetKey;
  randomizeInitiativeEachRound: boolean;
  monsters: Monster[];
  npcs: NpcListRow[];
}

/** What a batch writes in one conditional update. */
export interface FightWrite {
  combatants_live: RunCombatant[];
  current_round: number;
  active_combatant_index: number;
  events_fired: string[];
  lair_fired_rounds: number[];
  applied_command_ids: string[];
}

/** What only the lifecycle commands write beside the fight's state. */
export interface FightLifecycleWrite {
  is_running: boolean;
  ended_at: string | null;
  started_at: string | null;
  session_id: string | null;
  magical_darkness: never[];
}

/** An end of fight's write to a companion: the same two fields the runner writes. */
export interface CompanionPatch {
  current_hp: number;
  conditions: AppliedCondition[];
}

export interface BatchDeps {
  loadFight(encounterId: string): Promise<LoadedFight>;
  /** Inserts the first row of an encounter's fight; null when another writer inserted it first (the caller loads again). */
  createFight(encounterId: string, first: FightWrite & Pick<FightLifecycleWrite, "is_running" | "ended_at">): Promise<{ id: string; version: number } | null>;
  loadPartyRows(partyMemberIds: string[]): Promise<PartyIngestRow[]>;
  /** Writes where `version = expectedVersion`; the new version when a row was written, null when another writer got there first. */
  saveFight(rowId: string, expectedVersion: number, next: FightWrite & Partial<FightLifecycleWrite>): Promise<{ version: number } | null>;
  persistPartyMember(partyMemberId: string, patch: PartyMemberUpdate): Promise<void>;
  persistCompanion(companionId: string, patch: CompanionPatch): Promise<void>;
  /** One live fight per campaign: every running fight of the campaign except this encounter's is stopped. */
  stopOtherRunningFights(encounterId: string): Promise<void>;
  /** Where the party stands before the fight ends, and the anchoring site when it is a place of this campaign (null when it is not). */
  loadEndContext(siteId: string | null): Promise<{ exploreParty: ExploreParty | null; siteId: string | null }>;
  setExploreParty(party: ExploreParty): Promise<void>;
  nowIso(): string;
  postBroadcast(message: string): Promise<void>;
  /** The stat blocks a fight's creatures came from; asked for only by a batch that resolves an action. */
  loadStatBlocks(ids: { monsterIds: string[]; npcIds: string[]; companionIds: string[] }): Promise<StatBlockSources>;
  /** The spell records named `name` (the campaign's own and the library's); asked for only by a batch that casts one (#1021). */
  loadSpells(name: string): Promise<SpellRecord[]>;
  /** The records of every spell in `names`, in two reads at most; asked for only by a `take_turn` of a creature that lists spells (#1021). */
  loadSpellsListed(names: string[]): Promise<SpellRecord[]>;
  /**
   * The player characters of a fight (by party member id), read for what their armour class and saves are worked out
   * from: their sheet rows, the campaign's inventory and the items it names. Asked for only by a batch that resolves
   * an action and has a player in the fight. A member of another campaign is never returned.
   */
  loadPlayerSheets(partyMemberIds: string[]): Promise<PlayerSheets>;
  /**
   * The battle map of an encounter as the rules read it (walls, closed doors), or null when it has none they can use.
   * Asked for only by a batch that resolves an action: cover counts on its attacks and Dexterity saves.
   */
  loadFightMap(encounterId: string): Promise<FightMap | null>;
  /** Posts a roll to the campaign log, stamped when `serverRolled`. */
  postRoll(roll: PostedRoll): Promise<void>;
  /** One die of any size, from the server's secure source: what a resolving command rolls with. */
  rollDie(sides: number): number;
  /**
   * One note judgment (#1203): whether each turn goes against a creature's note. Null when it is not allowed (campaign
   * AI off, no platform key, `alreadyThisBatch` plus the fight's earlier ones at the cap) or did not work; it never
   * throws. A non-null answer is a real call, recorded afterwards through `recordNoteJudgment`.
   */
  judgeNote(request: JudgeRequest, alreadyThisBatch: number): Promise<JudgeResult | null>;
  /** The cost row of one real note judgment. Free to the user; called only after the fight is saved. */
  recordNoteJudgment(inputTokens: number): Promise<void>;
  rollD20(): number;
  rollD6(): number;
  now(): number;
}

export interface LiveFightView {
  combatants_live: RunCombatant[];
  current_round: number;
  active_combatant_index: number;
  events_fired: string[];
  lair_fired_rounds: number[];
}

export interface BatchResult {
  /** False when this batch id had already been applied; nothing was done. */
  applied: boolean;
  version: number;
  /** Whether the players' screens are in this fight. */
  is_running: boolean;
  ended_at: string | null;
  state: LiveFightView;
  /** What the engine raised, for the caller to show (conditions due, concentration saves, recharges, spawns, broadcasts). */
  effects: FightEffect[];
  /** Effects that could not be performed after the save (the state is saved regardless); empty when all went through. */
  effectFailures: string[];
}

function viewOf(row: LiveFightView): LiveFightView {
  return {
    combatants_live: row.combatants_live,
    current_round: row.current_round,
    active_combatant_index: row.active_combatant_index,
    events_fired: row.events_fired,
    lair_fired_rounds: row.lair_fired_rounds,
  };
}

/** The row's own fields a fight state is built from; a fight about to be opened has no row yet and passes its first roster. */
type StateSource = Pick<FightRow, "combatants_live" | "current_round" | "active_combatant_index" | "events_fired" | "lair_fired_rounds">;

function buildState(loaded: LoadedFight, row: StateSource): FightState {
  return {
    combatants: row.combatants_live,
    round: row.current_round,
    activeIndex: row.active_combatant_index,
    started: startedFromRound(row.current_round),
    randomizeInitiativeEachRound: loaded.randomizeInitiativeEachRound,
    ruleset: loaded.ruleset,
    lairEnabled: loaded.lairEnabled,
    // Same lookup the runner makes when it opens a fight (EncounterRunSurface).
    lairOwnerInstanceId:
      loaded.lairEnabled && loaded.lairOwnerDefId
        ? (row.combatants_live.find((c) => c.def_id === loaded.lairOwnerDefId)?.instance_id ?? null)
        : null,
    lairFiredRounds: row.lair_fired_rounds,
    events: loaded.events,
    eventsFired: row.events_fired,
  };
}

/**
 * The note judgments of one request. A fight that changed under the batch reruns the attempt, and the answer to
 * "does this turn go against the note" is the same for the same creature and the same turns, so it is asked once per
 * request: a rerun with the same options reuses it (a refusal too, so a failed call is not repeated), and only a
 * different set asks again. `answered` holds the real calls, the ones to bill.
 */
interface NoteJudgments {
  ask(key: string, request: JudgeRequest): Promise<JudgeResult | null>;
  answered: JudgeResult[];
}

function noteJudgmentsOf(deps: BatchDeps): NoteJudgments {
  const remembered = new Map<string, JudgeResult | null>();
  const answered: JudgeResult[] = [];
  return {
    answered,
    async ask(key, request) {
      if (remembered.has(key)) return remembered.get(key) ?? null;
      const answer = await deps.judgeNote(request, answered.length);
      remembered.set(key, answer);
      if (answer !== null) answered.push(answer);
      return answer;
    },
  };
}

/** One attempt: everything worked out from the row as loaded, nothing written yet. `rolls` are what its resolving commands rolled, to be posted only if this attempt is the one saved. */
async function attempt(
  request: CommandRequest,
  loaded: LoadedFight,
  row: FightRow,
  deps: BatchDeps,
  notes: NoteJudgments,
): Promise<{ state: FightState; effects: FightEffect[]; rolls: PostedRoll[] }> {
  const fightDeps: FightDeps = {
    monsters: loaded.monsters,
    npcs: loaded.npcs,
    now: deps.now,
    // Dice are rolled here, inside the attempt that may be saved: a retried attempt rolls again,
    // which is right because the earlier roll was never written anywhere.
    rollD20: deps.rollD20,
    rollD6: deps.rollD6,
  };
  let state = buildState(loaded, row);
  const effects: FightEffect[] = [];

  // What the players changed on their own sheets comes first, so a command lands on the HP the table really has.
  const memberIds = [...new Set(state.combatants.flatMap((c) => (c.party_member_id ? [c.party_member_id] : [])))];
  if (memberIds.length > 0) {
    const rows = await deps.loadPartyRows(memberIds);
    for (const partyRow of rows) {
      const held = state.combatants.find((c) => c.party_member_id === partyRow.id);
      const result = ingestPartyRow(
        state,
        partyRow,
        // The spell the fight last knew the member concentrating on, so a spell dropped on the sheet ends what it held.
        // "Live" is whether the players' screens are in this fight (the lobby included), not whether combat has
        // started: a player rolls initiative in the lobby, and a row read before the lobby opens still carries last session's roll.
        { live: row.is_running, lastConcentration: held ? (held.concentration?.spellName ?? null) : undefined },
        fightDeps,
      );
      state = result.state;
      effects.push(...result.effects);
    }
  }

  const rolls: PostedRoll[] = [];
  // The stat blocks and the player sheets are read once per attempt, and only when the batch has an action to resolve.
  let sources: StatBlockSources | null = null;
  let players: PlayerSheets | null = null;
  let map: FightMap | null | undefined;
  // A spell is read the first time a cast names it, and once per attempt.
  const spellRecords = new Map<string, Promise<SpellRecord[]>>();
  const spells = (name: string): Promise<SpellRecord[]> => {
    const key = spellKey(name);
    const known = spellRecords.get(key);
    if (known !== undefined) return known;
    const read = deps.loadSpells(name);
    spellRecords.set(key, read);
    return read;
  };
  // The spells a creature lists, read together the first time its turn asks, and once per attempt per set of names.
  const listedRecords = new Map<string, Promise<SpellRecord[]>>();
  const spellsListed = (names: string[]): Promise<SpellRecord[]> => {
    const key = names.map(spellKey).sort().join("|");
    const known = listedRecords.get(key);
    if (known !== undefined) return known;
    const read = deps.loadSpellsListed(names);
    listedRecords.set(key, read);
    return read;
  };
  /** Reads what resolving an action needs, the first time something asks. */
  const resolveEnv = async (): Promise<ResolveEnv> => {
    if (sources === null) {
      const fetched = await deps.loadStatBlocks(statBlockIdsOf(state.combatants));
      // What a fight's own events spawn is already loaded; a spawn earlier in the batch can be acted with.
      sources = {
        monsters: [...fetched.monsters, ...loaded.monsters],
        npcs: [...fetched.npcs, ...loaded.npcs],
        companions: fetched.companions,
      };
    }
    if (players === null) {
      const memberIds = [...new Set(state.combatants.flatMap((c) => (c.type === "player" && c.party_member_id ? [c.party_member_id] : [])))];
      // A fight with no player in it has nothing to read.
      players = memberIds.length > 0 ? await deps.loadPlayerSheets(memberIds) : { members: [], inventory: [], items: [], beasts: [] };
    }
    // `undefined` is "not asked yet" (a null map is an answer: this fight has none).
    if (map === undefined) map = await deps.loadFightMap(request.encounterId);
    return { fightDeps, sources, players, map, rollDie: deps.rollDie, spells, spellsListed, posted: rolls, judgeNote: notes.ask };
  };
  for (const command of request.commands) {
    if (command.type === "sync_party" || LIFECYCLE_TYPES.has(command.type)) continue;
    if (isTakeTurnCommand(command)) {
      const result = await applyTakeTurn(state, command, await resolveEnv());
      state = result.state;
      effects.push(...result.effects);
      continue;
    }
    if (isProvokeCommand(command)) {
      const result = await applyProvoke(state, command, await resolveEnv());
      state = result.state;
      effects.push(...result.effects);
      continue;
    }
    if (isResolvingCommand(command)) {
      const result = await applyResolvingCommand(state, command, await resolveEnv());
      state = result.state;
      effects.push(...result.effects);
      continue;
    }
    const result = applyFightCommand(state, command as FightCommand, fightDeps);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects, rolls };
}

/** Whether a write would leave the fight exactly as the row has it (the batch id aside). */
function sameFight(row: FightRow, write: FightWrite): boolean {
  return (
    row.current_round === write.current_round &&
    row.active_combatant_index === write.active_combatant_index &&
    JSON.stringify(row.combatants_live) === JSON.stringify(write.combatants_live) &&
    JSON.stringify(row.events_fired) === JSON.stringify(write.events_fired) &&
    JSON.stringify(row.lair_fired_rounds) === JSON.stringify(write.lair_fired_rounds)
  );
}

/** A write to another table is tried this many times before it is given up on. */
const PERSIST_ATTEMPTS = 3;

/** Retries a write that lands on another row than the fight's, which no retry of the batch would repeat. */
async function withRetries(write: () => Promise<void>): Promise<void> {
  for (let attemptNo = 1; ; attemptNo++) {
    try {
      await write();
      return;
    } catch (e) {
      if (attemptNo >= PERSIST_ATTEMPTS) throw e;
    }
  }
}

/** Runs each named write after the save that decided it; a failure is reported, never thrown, because the fight is saved regardless. */
async function performAll(writes: Array<{ name: string; run: () => Promise<void> }>): Promise<string[]> {
  const failures: string[] = [];
  for (const write of writes) {
    try {
      await withRetries(write.run);
    } catch (e) {
      failures.push(`${write.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return failures;
}

async function perform(effects: FightEffect[], deps: BatchDeps): Promise<string[]> {
  const failures: string[] = [];
  for (const effect of effects) {
    try {
      if (effect.type === "player_persist") {
        // The character's own row is the authority for their HP, conditions and death saves: the next batch
        // ingests it before anything else. A patch that does not land would let that ingest put the fight back to
        // what the row still says, undoing the damage this batch dealt. So it is retried before being reported.
        await withRetries(() => deps.persistPartyMember(effect.partyMemberId, effect.patch));
      } else if (effect.type === "broadcast") await deps.postBroadcast(effect.message);
    } catch (e) {
      failures.push(`${effect.type}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return failures;
}

function writeOf(state: FightState, previousIds: string[], batchId: string): FightWrite {
  return {
    combatants_live: state.combatants,
    current_round: state.round,
    active_combatant_index: state.activeIndex,
    events_fired: state.eventsFired,
    lair_fired_rounds: state.lairFiredRounds,
    applied_command_ids: [...previousIds, batchId].slice(-APPLIED_IDS_KEPT),
  };
}

function resultOf(
  applied: boolean,
  version: number,
  fight: { is_running: boolean; ended_at: string | null },
  view: LiveFightView,
  effects: FightEffect[],
  effectFailures: string[],
): BatchResult {
  return { applied, version, is_running: fight.is_running, ended_at: fight.ended_at, state: viewOf(view), effects, effectFailures };
}

const playerMemberIds = (combatants: readonly RunCombatant[]): string[] =>
  combatants.flatMap((c) => (c.type === "player" && c.party_member_id ? [c.party_member_id] : []));

const clearInitiativeWrites = (ids: string[], deps: BatchDeps) =>
  ids.map((id) => ({ name: "clear_initiative", run: () => deps.persistPartyMember(id, { current_initiative: null }) }));

/** `open` on an encounter with no row, or whose last fight ended: a new fight on `command.combatants`. */
async function openFight(request: CommandRequest, command: Extract<LifecycleCommand, { type: "open" }>, loaded: LoadedFight, deps: BatchDeps): Promise<BatchResult | null> {
  const fresh: StateSource = {
    combatants_live: command.combatants,
    current_round: 0,
    active_combatant_index: 0,
    events_fired: [],
    lair_fired_rounds: [],
  };
  let state = buildState(loaded, fresh);
  if (command.legendaryCaps) {
    // The same priming the runner applies to a roster it has just built (legendaryActionCaps).
    state = applyFightCommand(state, { type: "prime_legendary_actions", caps: command.legendaryCaps }, {
      monsters: loaded.monsters, npcs: loaded.npcs, now: deps.now, rollD20: deps.rollD20, rollD6: deps.rollD6,
    }).state;
  }
  if (loaded.row === null) {
    const first = { ...writeOf(state, [], request.batchId), is_running: false, ended_at: null };
    const created = await deps.createFight(request.encounterId, first);
    if (!created) return null;
    return resultOf(true, created.version, first, first, [], []);
  }
  // The last fight ended: the row is reset to a new one. Nothing of the old fight survives, its batch ids included
  // (a retry of one of those would otherwise be taken for already applied and answered with the new fight).
  const next = {
    ...writeOf(state, [], request.batchId),
    is_running: false, ended_at: null, started_at: null, session_id: null, magical_darkness: [],
  } satisfies FightWrite & Partial<FightLifecycleWrite>;
  const saved = await deps.saveFight(loaded.row.id, loaded.row.version, next);
  if (!saved) return null;
  return resultOf(true, saved.version, next, next, [], []);
}

async function runLifecycle(
  request: CommandRequest,
  command: LifecycleCommand,
  loaded: LoadedFight,
  deps: BatchDeps,
): Promise<BatchResult | null> {
  const { row } = loaded;
  if (command.type === "open") {
    // A fight that has not ended is the one to resume (a reload, a second device): opening changes nothing.
    if (row !== null && row.ended_at === null) return resultOf(false, row.version, row, row, [], []);
    return openFight(request, command, loaded, deps);
  }
  if (row === null) throw new FightCommandError(404, "This encounter has no fight to " + (command.type === "go_live" ? "put live" : "close") + ".");
  if (row.ended_at !== null) throw new FightCommandError(409, "This fight has ended.");

  if (command.type === "go_live") {
    let state = buildState(loaded, row);
    const members = playerMemberIds(row.combatants_live);
    const notStarted = !state.started;
    if (notStarted) {
      // Opening the lobby wipes last session's rolls, so the only initiative a fight ever ingests was made for it.
      // Going live again once combat has started is resuming it, and those rolls are the turn order.
      for (const c of state.combatants) {
        if (c.type === "player" && c.party_member_id) {
          state = applyFightCommand(state, { type: "set_initiative", instanceId: c.instance_id, value: null }, {
            monsters: loaded.monsters, npcs: loaded.npcs, now: deps.now, rollD20: deps.rollD20, rollD6: deps.rollD6,
          }).state;
        }
      }
    }
    const next = {
      ...writeOf(state, row.applied_command_ids, request.batchId),
      is_running: true, ended_at: null, started_at: deps.nowIso(), session_id: command.sessionId,
    } satisfies FightWrite & Partial<FightLifecycleWrite>;
    const saved = await deps.saveFight(row.id, row.version, next);
    if (!saved) return null;
    const failures = await performAll([
      ...(notStarted ? clearInitiativeWrites(members, deps) : []),
      { name: "stop_other_fights", run: () => deps.stopOtherRunningFights(request.encounterId) },
    ]);
    return resultOf(true, saved.version, next, next, [], failures);
  }

  if (command.type === "go_private") {
    // Only the flag: the roster, the turn and the rolls are the fight's, and it is not over.
    const state = buildState(loaded, row);
    const next = { ...writeOf(state, row.applied_command_ids, request.batchId), is_running: false } satisfies FightWrite & Partial<FightLifecycleWrite>;
    const saved = await deps.saveFight(row.id, row.version, next);
    if (!saved) return null;
    return resultOf(true, saved.version, { is_running: false, ended_at: row.ended_at }, next, [], []);
  }

  if (command.type === "abandon") {
    // Hit points and conditions stay as they were; only the rolls, which belonged to this fight, are cleared.
    const state = buildState(loaded, row);
    const next = { ...writeOf(state, row.applied_command_ids, request.batchId), is_running: false, ended_at: deps.nowIso() } satisfies FightWrite & Partial<FightLifecycleWrite>;
    const saved = await deps.saveFight(row.id, row.version, next);
    if (!saved) return null;
    const failures = await performAll(clearInitiativeWrites(playerMemberIds(row.combatants_live), deps));
    return resultOf(true, saved.version, next, next, [], failures);
  }

  // end_combat: what the players changed on their own sheets comes first, so the write-back carries what the table really has.
  const { state } = await attempt({ ...request, commands: [] }, loaded, row, deps, noteJudgmentsOf(deps));
  const context = await deps.loadEndContext(command.siteId === undefined ? null : command.siteId);
  // The saved roster is the authority for where the tokens stand: the browser's store does not hear a player moving their own token.
  const patches = endOfFightPatches({ combatants: state.combatants, tokensAtEnd: state.combatants, exploreParty: context.exploreParty, siteId: context.siteId });
  const next = { ...writeOf(state, row.applied_command_ids, request.batchId), is_running: false, ended_at: deps.nowIso() } satisfies FightWrite & Partial<FightLifecycleWrite>;
  const saved = await deps.saveFight(row.id, row.version, next);
  if (!saved) return null;
  const failures = await performAll([
    ...patches.partyMembers.map(({ id, patch }) => ({ name: "player_persist", run: () => deps.persistPartyMember(id, patch) })),
    ...patches.companions.map(({ id, patch }) => ({ name: "companion", run: () => deps.persistCompanion(id, patch) })),
    ...(patches.exploreParty ? [{ name: "explore_party", run: () => deps.setExploreParty(patches.exploreParty!) }] : []),
  ]);
  return resultOf(true, saved.version, next, next, [], failures);
}

export async function runBatch(request: CommandRequest, deps: BatchDeps): Promise<BatchResult> {
  const notes = noteJudgmentsOf(deps);
  const first = request.commands[0];
  const lifecycle = request.commands.length === 1 && LIFECYCLE_TYPES.has(first.type) ? (first as LifecycleCommand) : null;
  for (let tries = 1; tries <= MAX_ATTEMPTS; tries++) {
    const loaded = await deps.loadFight(request.encounterId);
    const { row } = loaded;

    // The reply of an earlier send may have been lost after it was applied: answer with the state as it is.
    // Before the ended check, so a retried End combat is answered rather than refused for a fight it just ended.
    if (row && row.applied_command_ids.includes(request.batchId)) {
      return resultOf(false, row.version, row, row, [], []);
    }

    if (lifecycle) {
      const result = await runLifecycle(request, lifecycle, loaded, deps);
      if (result) return result;
      continue;
    }

    const syncOnly = request.commands.length === 1 && request.commands[0].type === "sync_party";
    if (!row) throw new FightCommandError(404, "This encounter has no fight.");
    if (row.ended_at !== null) {
      // The runner asks for a sync whenever a character's row rings, and ending a fight writes those rows: the
      // sync that follows finds the fight over. That is nothing lost, so it is answered, not refused.
      if (syncOnly) return resultOf(false, row.version, row, row, [], []);
      throw new FightCommandError(409, "This fight has ended.");
    }

    const { state, effects, rolls } = await attempt(request, loaded, row, deps, notes);
    const write = writeOf(state, row.applied_command_ids, request.batchId);
    // Most syncs find the sheets as the fight already has them (the ring was this fight's own write to a sheet
    // coming back). Saving anyway would raise the version and ring every screen for nothing, on every hit.
    if (syncOnly && sameFight(row, write)) return resultOf(false, row.version, row, row, [], []);
    const saved = await deps.saveFight(row.id, row.version, write);
    if (!saved) continue;

    const effectFailures = await perform(effects, deps);
    // The rolls are the log's record of what the fight now holds, so they are posted only for the attempt that was saved.
    effectFailures.push(...(await performAll(rolls.map((roll) => ({ name: "roll", run: () => deps.postRoll(roll) })))));
    // Billed after the save, like the rolls, and only for calls that answered: a refused or failed one cost nothing we know of.
    effectFailures.push(...(await performAll(notes.answered.map((answer) => ({ name: "note_judgment", run: () => deps.recordNoteJudgment(answer.inputTokens) })))));
    return resultOf(true, saved.version, row, write, effects, effectFailures);
  }
  throw new FightCommandError(409, "The fight kept changing under this command; try again.");
}
