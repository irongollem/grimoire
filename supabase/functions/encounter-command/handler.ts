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
import type { RulesetKey } from "../../../src/types/ruleset.types.ts";
import type { Monster } from "../../../src/types/monster.types.ts";
import type { NpcListRow } from "../../../src/types/npc.types.ts";
import type { EncounterTurnCommand } from "../../../src/rules/encounterTurn.ts";
import { applyFightCommand } from "../../../src/rules/fight/fightCommands.ts";
import { fireFightEvent, type FightDeps } from "../../../src/rules/fight/fightEvents.ts";
import { ingestPartyRow, type PartyIngestRow } from "../../../src/rules/fight/partyIngest.ts";
import { startedFromRound, type FightEffect, type FightState } from "../../../src/rules/fight/fightState.ts";

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
  "end_concentration", "enter_wildshape", "revert_wildshape", "set_size_override", "toggle_surprised", "toggle_reaction",
  "record_move", "undo_move", "set_action_used", "set_bonus_used", "prime_legendary_actions", "spend_legendary_actions",
  "mark_lair_fired", "set_boss_mechanics", "remove_combatant", "use_action", "restore_action",
] as const satisfies readonly EncounterTurnCommand["type"][];

type MissingCommandTypes = Exclude<EncounterTurnCommand["type"], (typeof REDUCER_COMMAND_TYPES)[number]>;
// Compile-time only: a reducer command missing from the list makes this `never` unassignable from `true`.
export const ALL_REDUCER_COMMANDS_LISTED: [MissingCommandTypes] extends [never] ? true : never = true;

const REDUCER_TYPE_SET: ReadonlySet<string> = new Set(REDUCER_COMMAND_TYPES);

/** The DM pressing an event, and a bare party sync: the two things a batch can ask that the reducer has no command for. */
export type FireEventCommand = { type: "fire_event"; eventId: string };
export type SyncPartyCommand = { type: "sync_party" };
export type BatchCommand = EncounterTurnCommand | FireEventCommand | SyncPartyCommand;

export interface CommandRequest {
  encounterId: string;
  batchId: string;
  commands: BatchCommand[];
}

export class FightCommandError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "FightCommandError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    if (command.type === "fire_event" || command.type === "sync_party") {
      if (commands.length !== 1) throw new FightCommandError(400, `${command.type} is sent alone.`);
      if (command.type === "fire_event" && (typeof command.eventId !== "string" || command.eventId.length === 0)) {
        throw new FightCommandError(400, "fire_event needs an eventId.");
      }
    } else if (!REDUCER_TYPE_SET.has(command.type)) {
      throw new FightCommandError(400, `Unknown command type: ${command.type}.`);
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
}

/** Everything a batch needs besides the row: the encounter's own settings and what its spawns are built from. */
export interface LoadedFight {
  row: FightRow;
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

export interface BatchDeps {
  /** Null when the encounter has no live row. */
  loadFight(encounterId: string): Promise<LoadedFight | null>;
  loadPartyRows(partyMemberIds: string[]): Promise<PartyIngestRow[]>;
  /** Writes where `version = expectedVersion`; the new version when a row was written, null when another writer got there first. */
  saveFight(rowId: string, expectedVersion: number, next: FightWrite): Promise<{ version: number } | null>;
  persistPartyMember(partyMemberId: string, patch: PartyMemberUpdate): Promise<void>;
  postBroadcast(message: string): Promise<void>;
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

function buildState(loaded: LoadedFight): FightState {
  const { row } = loaded;
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

/** One attempt: everything worked out from the row as loaded, nothing written yet. */
async function attempt(request: CommandRequest, loaded: LoadedFight, deps: BatchDeps): Promise<{ state: FightState; effects: FightEffect[] }> {
  const fightDeps: FightDeps = {
    monsters: loaded.monsters,
    npcs: loaded.npcs,
    now: deps.now,
    // Dice are rolled here, inside the attempt that may be saved: a retried attempt rolls again,
    // which is right because the earlier roll was never written anywhere.
    rollD20: deps.rollD20,
    rollD6: deps.rollD6,
  };
  let state = buildState(loaded);
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
        { live: state.started, lastConcentration: held ? (held.concentration?.spellName ?? null) : undefined },
        fightDeps,
      );
      state = result.state;
      effects.push(...result.effects);
    }
  }

  for (const command of request.commands) {
    if (command.type === "sync_party") continue;
    const result =
      command.type === "fire_event"
        ? fireFightEvent(state, command.eventId, fightDeps)
        : applyFightCommand(state, command, fightDeps);
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

/** A party-member write is tried this many times before it is given up on. */
const PERSIST_ATTEMPTS = 3;

async function perform(effects: FightEffect[], deps: BatchDeps): Promise<string[]> {
  const failures: string[] = [];
  for (const effect of effects) {
    try {
      if (effect.type === "player_persist") {
        // The character's own row is the authority for their HP, conditions and death saves: the next batch
        // ingests it before anything else. A patch that does not land would let that ingest put the fight back to
        // what the row still says, undoing the damage this batch dealt. So it is retried before being reported.
        for (let attempt = 1; ; attempt++) {
          try {
            await deps.persistPartyMember(effect.partyMemberId, effect.patch);
            break;
          } catch (e) {
            if (attempt >= PERSIST_ATTEMPTS) throw e;
          }
        }
      } else if (effect.type === "broadcast") await deps.postBroadcast(effect.message);
    } catch (e) {
      failures.push(`${effect.type}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return failures;
}

export async function runBatch(request: CommandRequest, deps: BatchDeps): Promise<BatchResult> {
  for (let tries = 1; tries <= MAX_ATTEMPTS; tries++) {
    const loaded = await deps.loadFight(request.encounterId);
    if (!loaded) throw new FightCommandError(404, "This encounter has no live fight.");
    const { row } = loaded;

    // The reply of an earlier send may have been lost after it was applied: answer with the state as it is.
    if (row.applied_command_ids.includes(request.batchId)) {
      return { applied: false, version: row.version, state: viewOf(row), effects: [], effectFailures: [] };
    }

    const { state, effects } = await attempt(request, loaded, deps);
    const write: FightWrite = {
      combatants_live: state.combatants,
      current_round: state.round,
      active_combatant_index: state.activeIndex,
      events_fired: state.eventsFired,
      lair_fired_rounds: state.lairFiredRounds,
      applied_command_ids: [...row.applied_command_ids, request.batchId].slice(-APPLIED_IDS_KEPT),
    };
    const saved = await deps.saveFight(row.id, row.version, write);
    if (!saved) continue;

    const effectFailures = await perform(effects, deps);
    return { applied: true, version: saved.version, state: viewOf({ ...write }), effects, effectFailures };
  }
  throw new FightCommandError(409, "The fight kept changing under this command; try again.");
}
