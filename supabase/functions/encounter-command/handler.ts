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

import type { FactionSides } from "../../../src/rules/fight/sides.ts";
import type { EncounterEvent, RunCombatant } from "../../../src/types/encounter.types.ts";
import type { PartyMemberUpdate, SpellSlotEntry } from "../../../src/types/party.types.ts";
import type { StoredClassResources } from "../../../src/rules/features/characterFeatures.ts";import type { ExploreParty } from "../../../src/types/exploreParty.types.ts";
import type { AppliedCondition } from "../../../src/types/condition.types.ts";
import { spellKey } from "../../../src/rules/fight/spells/castLimit.ts";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice.ts";
import type { RulesetKey } from "../../../src/types/ruleset.types.ts";
import type { Monster } from "../../../src/types/monster.types.ts";
import type { NpcListRow } from "../../../src/types/npc.types.ts";
import type { EncounterTurnCommand } from "../../../src/rules/encounterTurn.ts";
import { isShownDefense } from "../../../src/rules/fight/tactics/shownDefenses.ts";
import { isShownDeedDelta } from "../../../src/rules/fight/tactics/shownThreat.ts";
import { applyWithRageUpkeep, settleRages } from "../../../src/rules/fight/allies/rageUpkeep.ts";
import { applyFightCommand, FIGHT_OWN_COMMAND_TYPES, type FightCommand } from "../../../src/rules/fight/fightCommands.ts";
import type { FightDeps } from "../../../src/rules/fight/fightEvents.ts";
import type { PartyIngestRow } from "../../../src/rules/fight/partyIngest.ts";
import { ingestPartyRows, partyMemberIdsOf } from "../_shared/fightPartyIngest.ts";
import { endOfFightPatches } from "../../../src/rules/fight/fightEnd.ts";
import { fightXp, type FightXpAward } from "../../../src/rules/fight/fightXp.ts";
import { startedFromRound, type FightEffect, type FightState } from "../../../src/rules/fight/fightState.ts";
import type { GearWrite, ThrownDrop } from "../../../src/rules/fight/pcAttacks/gear.ts";
import { NO_CASTING, type PlayerSheets } from "../../../src/rules/fight/playerSheet.ts";
import type { FightMap } from "../../../src/rules/fight/terrain/battleMap.ts";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe.ts";
import { FightCommandError } from "./commandError.ts";
import { lastCosts, owedOf, parseOwedWrites, type OwedWrites, type SpentCosts } from "./owedWrites.ts";
import {
  isAnswerReactionCommand, parsePendingReaction, pendingOf, playedRunOf, ReactionPause, validateAnswerReactionCommand,
  type AnswerReactionCommand, type PendingReaction, type PlayedRun,
} from "./playedReaction.ts";
import { isRecord, validateCombatants, validateReducerCommand } from "./commandShape.ts";
import { applyProvoke, isProvokeCommand, validateProvokeCommand, type ProvokeCommand } from "./opportunity.ts";
import { applyTakeTurn, isTakeTurnCommand, MAX_MEMBER_ID_LENGTH, validateTakeTurnCommand, type TakeTurnCommand } from "./takeTurn.ts";
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
export type { AnswerReactionCommand, PendingReaction };
export type { OwedWrites };
export { ALL_RESOLVING_COMMANDS_LISTED, type ResolvingCommand, type PostedRoll, type StatBlockSources } from "./resolve.ts";

export const MAX_COMMANDS = 50;
export const MAX_BATCH_ID_LENGTH = 80;
export const MAX_BODY_CHARACTERS = 200_000;
/**
 * How many applied batch ids the fight row remembers, so a retry of a batch the server already applied is answered, not applied
 * twice. The client sends one batch at a time and retries the oldest unanswered one (half a second doubling to ten seconds, with
 * no cap on the tries: `retryDelayMs`, `useFightCommands`), so one device never puts newer ids ahead of its own retry. Only
 * ANOTHER device's batches do, while a lost reply keeps the first device retrying through an outage. A DM sends at most about
 * one batch a second even when busy, so 256 ids cover an outage of four minutes with a second device at that peak, and
 * about half an hour at a normal ten a minute; the old 64 covered one minute. An id is at most 80 characters, so the list
 * is under 25 KB at the very worst and about 10 KB with uuids, against a roster that is already tens of KB.
 */
export const APPLIED_IDS_KEPT = 256;
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
  /**
   * The server builds the first roster from the encounter, the party and the campaign's own rows (#1021 row 16), with the shared rules in
   * `src/rules/fight/roster/`. `playedMemberId` names the AI table's played character: the party is then that character and the members the AI
   * plays, and the characters in the room join as bystanders. Absent, it is the DM's own fight of the encounter's party.
   */
  | { type: "open"; playedMemberId?: string }
  /** The session is started (and announced) by the browser, which hands over its id. */
  | { type: "go_live"; sessionId: string | null }
  /** `siteId` is the site the fight is anchored in, resolved by the caller through the map stack; the server only checks it is this campaign's place. */
  | { type: "end_combat"; siteId?: string | null }
  | { type: "abandon" }
  /** The DM turns Go Live off: the players' screens leave the fight, which goes on. Nothing else about it changes. */
  | { type: "go_private" };
export const LIFECYCLE_TYPES: ReadonlySet<string> = new Set(["open", "go_live", "end_combat", "abandon", "go_private"]);
export type BatchCommand = FightCommand | SyncPartyCommand | LifecycleCommand | ResolvingCommand | TakeTurnCommand | ProvokeCommand | AnswerReactionCommand;

export const MAX_ADDED_COMBATANTS = 30;
export const MAX_OPENED_COMBATANTS = 60;
const REVEAL_STATES: ReadonlySet<unknown> = new Set(["hidden", "unseen", "revealed"]);

export interface CommandRequest {
  encounterId: string;
  batchId: string;
  commands: BatchCommand[];
}

function validateLifecycleCommand(command: Record<string, unknown>): void {
  switch (command.type) {
    case "open": {
      // The roster is the server's to build; the one thing the caller says is whose table it is.
      const played = command.playedMemberId;
      if (played !== undefined && (typeof played !== "string" || played.length === 0 || played.length > MAX_MEMBER_ID_LENGTH)) {
        throw new FightCommandError(400, "open: playedMemberId is the id of the party member the person plays.");
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
    } else if (isAnswerReactionCommand(command as { type: string })) {
      // It replays the paused turn from the fight as it stands, so nothing is sent beside it.
      if (commands.length !== 1) throw new FightCommandError(400, "answer_reaction is sent alone.");
      validateAnswerReactionCommand(command);
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
      validateReducerCommand(command);
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
  /** When combat first went live; null before. The note-judgment cap counts from it, so going live again must not move it. */
  started_at: string | null;
  /**
   * The Reaction the played character is being asked for, and what replays the paused creature turn (`playedReaction.ts`); null when
   * nothing waits. A jsonb column: what is read back is checked by `parsePendingReaction`, never trusted.
   */
  pending_reaction: PendingReaction | null;
  /**
   * What the batch that answered the person's Reaction still owes their sheet (the slot, the daily use, the class resource), saved in the same update as
   * the fight and cleared once the writes landed (`owedWrites.ts`); null when nothing is owed. Checked by `parseOwedWrites`, never trusted.
   */
  owed_writes: OwedWrites | null;
}

/** Everything a batch needs besides the row: the encounter's own settings and what its spawns are built from. */
export interface LoadedFight {
  /** Null when the encounter has no saved fight yet: only `open` can make one. */
  row: FightRow | null;
  events: EncounterEvent[];
  lairEnabled: boolean;
  lairOwnerDefId: string | null;
  /** The encounter's factions: who fights whom when the server plays a turn (`src/rules/fight/sides.ts`). */
  factions: FactionSides;
  ruleset: RulesetKey;
  randomizeInitiativeEachRound: boolean;
  /** The campaign uses the Experience Points rule: ending a fight gives its XP (#1021 row 27). */
  xpLevelling: boolean;
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
  /** Written only by a batch that pauses a turn (the pending Reaction) or finishes or closes one (null); left out, the column is untouched. */
  pending_reaction?: PendingReaction | null;
  /** Written only by the batch that answers a Reaction and spent something on a sheet; left out, the column is untouched. */
  owed_writes?: OwedWrites | null;
}

/** What only the lifecycle commands write beside the fight's state. */
export interface FightLifecycleWrite {
  is_running: boolean;
  ended_at: string | null;
  started_at: string | null;
  session_id: string | null;
  magical_darkness: never[];
  /** Cleared when the encounter is fought again, so the new fight's XP is given too (`award_fight_xp`). */
  xp_awarded_at: null;
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
  /**
   * The first roster of a fight, built from the database with the shared rules (#1021 row 16). Asked for only when a fresh fight is
   * opened, never on a resume. Refuses (400) a `playedMemberId` that is not one of the campaign's active party members.
   */
  buildRoster(playedMemberId: string | null): Promise<{ combatants: RunCombatant[]; legendaryCaps: Record<string, number> }>;
  /** Whether `sessionId` is a session of this campaign (never another campaign's, never one that does not exist). */
  isCampaignSession(sessionId: string): Promise<boolean>;
  /** Writes where `version = expectedVersion`; the new version when a row was written, null when another writer got there first. */
  saveFight(rowId: string, expectedVersion: number, next: FightWrite & Partial<FightLifecycleWrite>): Promise<{ version: number } | null>;
  persistPartyMember(partyMemberId: string, patch: PartyMemberUpdate): Promise<void>;
  persistCompanion(companionId: string, patch: CompanionPatch): Promise<void>;
  /** One live fight per campaign: every running fight of the campaign except this encounter's is stopped. */
  stopOtherRunningFights(encounterId: string): Promise<void>;
  /** Where the party stands before the fight ends, and the anchoring site when it is a place of this campaign (null when it is not). */
  loadEndContext(siteId: string | null): Promise<{ exploreParty: ExploreParty | null; siteId: string | null }>;
  setExploreParty(party: ExploreParty): Promise<void>;
  /** Gives a fight's XP, once per ended fight however often it is asked (`award_fight_xp`). */
  awardFightXp(award: FightXpAward): Promise<void>;
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
   * The party members of this campaign the AI may play in a DM's own fight (#1021 row 26): `ai_speaks` and `ai_stands_in`, and an account
   * the AI gate does not refuse. Decided by the server, never named by the request. Asked for only by a batch that resolves an action.
   */
  loadStandIns(): Promise<ReadonlySet<string>>;
  /**
   * The battle map of an encounter as the rules read it (walls, closed doors), or null when it has none they can use.
   * Asked for only by a batch that resolves an action: cover counts on its attacks and Dexterity saves.
   */
  loadFightMap(encounterId: string): Promise<FightMap | null>;
  /** Posts a roll to the campaign log, stamped when `serverRolled`. */
  postRoll(roll: PostedRoll): Promise<void>;
  /** Puts a weapon an ally threw on the ground, as the campaign chat's thrown-weapon drop anyone can pick up (`speaker` is the thrower's name). */
  dropThrown(drop: ThrownDrop, memberId: string, speaker: string): Promise<void>;
  /** Writes what an ally's attacks used up to the campaign's inventory (ammunition, the thrown weapon's stack). Every write is absolute, so a retry lands once. */
  writeGear(writes: GearWrite[]): Promise<void>;
  /** Writes an ally's spell slots after a cast, the whole list as it now stands (absolute, so a retry lands once). */
  writeSpellSlots(memberId: string, slots: SpellSlotEntry[]): Promise<void>;
  /** Writes the uses an ally's innate spell has left (`character_spells.uses_remaining`) after a cast, as an absolute count (so a retry lands once). */
  writeInnateUses(memberId: string, spellRowId: string, remaining: number): Promise<void>;
  /** Writes an ally's `class_resources` after a class feature spent a use (Rage, Second Wind, Action Surge, Ki), the whole object as it now stands (absolute, so a retry lands once). */
  writeClassResources(memberId: string, resources: StoredClassResources): Promise<void>;
  /** Takes the owed record of `batchId` off the fight row once its writes landed (a no-op when another record is there). Raises the row's version like any update. */
  clearOwedWrites(rowId: string, batchId: string): Promise<void>;
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
  /** A turn the person's own Reaction may pause (`playedReaction.ts`): its dice and judgments are taped, and a moment of theirs asks them. Null: the DM's own fight and every other command. */
  played: PlayedRun | null = null,
): Promise<{ state: FightState; effects: FightEffect[]; rolls: PostedRoll[]; spent: ResolveEnv["spent"]; slotsSpent: ResolveEnv["slotsSpent"]; resourcesSpent: ResolveEnv["resourcesSpent"]; innateSpent: ResolveEnv["innateSpent"]; noteTokens: number[] | null }> {
  // Every die of the attempt comes from these three: a played turn draws them through its tape, so a replay throws the same dice.
  const dice = played === null ? { rollD20: deps.rollD20, rollD6: deps.rollD6, rollDie: deps.rollDie } : played.tape.wrap(deps);
  const fightDeps: FightDeps = {
    monsters: loaded.monsters,
    npcs: loaded.npcs,
    now: deps.now,
    // Dice are rolled here, inside the attempt that may be saved: a retried attempt rolls again,
    // which is right because the earlier roll was never written anywhere.
    rollD20: dice.rollD20,
    rollD6: dice.rollD6,
  };
  let state = buildState(loaded, row);
  const effects: FightEffect[] = [];

  // What the players changed on their own sheets comes first, so a command lands on the HP the table really has.
  const memberIds = partyMemberIdsOf(state);
  if (memberIds.length > 0) {
    const ingested = ingestPartyRows(state, await deps.loadPartyRows(memberIds), row.is_running, fightDeps);
    state = ingested.state;
    effects.push(...ingested.effects);
  }

  const rolls: PostedRoll[] = [];
  const spent: ResolveEnv["spent"] = [];
  const slotsSpent: ResolveEnv["slotsSpent"] = [];
  const resourcesSpent: ResolveEnv["resourcesSpent"] = [];
  const innateSpent: ResolveEnv["innateSpent"] = [];
  // The stat blocks and the player sheets are read once per attempt, and only when the batch has an action to resolve.
  let sources: StatBlockSources | null = null;
  let players: PlayerSheets | null = null;
  let map: FightMap | null | undefined;
  let standIns: ReadonlySet<string> | null = null;
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
  // The ids already asked for, so an id that names nothing is not asked again by every command of the batch.
  const askedFor = { monsterIds: new Set<string>(), npcIds: new Set<string>(), companionIds: new Set<string>() };
  /** Reads what resolving an action needs, the first time something asks. */
  const resolveEnv = async (): Promise<ResolveEnv> => {
    // A creature added earlier in this batch has no stat block loaded yet: read the ones the roster names that were not asked for.
    const wanted = statBlockIdsOf(state.combatants);
    const missing = {
      monsterIds: wanted.monsterIds.filter((id) => !askedFor.monsterIds.has(id)),
      npcIds: wanted.npcIds.filter((id) => !askedFor.npcIds.has(id)),
      companionIds: wanted.companionIds.filter((id) => !askedFor.companionIds.has(id)),
    };
    if (sources === null || missing.monsterIds.length + missing.npcIds.length + missing.companionIds.length > 0) {
      for (const id of missing.monsterIds) askedFor.monsterIds.add(id);
      for (const id of missing.npcIds) askedFor.npcIds.add(id);
      for (const id of missing.companionIds) askedFor.companionIds.add(id);
      const fetched = await deps.loadStatBlocks(missing);
      // What a fight's own events spawn is already loaded; a spawn earlier in the batch can be acted with.
      sources = {
        monsters: [...fetched.monsters, ...(sources === null ? loaded.monsters : sources.monsters)],
        npcs: [...fetched.npcs, ...(sources === null ? loaded.npcs : sources.npcs)],
        companions: [...fetched.companions, ...(sources === null ? [] : sources.companions)],
      };
    }
    if (players === null) {
      const memberIds = [...new Set(state.combatants.flatMap((c) => (c.type === "player" && c.party_member_id ? [c.party_member_id] : [])))];
      // A fight with no player in it has nothing to read.
      // A replay of a paused turn plays from the sheets the first run read (`SheetSnapshot`); the first run keeps what it reads for a pause to save.
      if (played !== null && played.frozen !== null && played.frozen.players !== null) players = played.frozen.players;
      else {
        players = memberIds.length > 0 ? await deps.loadPlayerSheets(memberIds) : { members: [], inventory: [], items: [], beasts: [], casting: NO_CASTING };
        if (played !== null) played.seen.players = players;
      }
    }
    // `undefined` is "not asked yet" (a null map is an answer: this fight has none).
    if (map === undefined) map = await deps.loadFightMap(request.encounterId);
    if (standIns === null) standIns = await deps.loadStandIns();
    return {
      fightDeps, sources, players, map, standIns, factions: loaded.factions, rollDie: dice.rollDie, spells, spellsListed, posted: rolls, spent, slotsSpent, resourcesSpent, innateSpent,
      judgeNote: played === null ? notes.ask : (key, request) => played.tape.note(key, () => notes.ask(key, request)),
      ...(played === null ? {} : { askPlayed: played.ask }),
    };
  };
  /** The Rages in the fight after a command (`rageUpkeep.ts`): the state they leave it in, their effects added to `effects`. */
  const settled = (from: FightState, to: FightState, into: FightEffect[]): FightState => {
    const upkept = settleRages(from, to, fightDeps);
    into.push(...upkept.effects);
    return upkept.state;
  };
  for (const command of request.commands) {
    if (command.type === "sync_party" || LIFECYCLE_TYPES.has(command.type)) continue;
    // What this command does to a raging ally (PHB 2014 and 2024 "Rage"): judged on the fight as the command found it and as it left it.
    const found = state;
    if (isTakeTurnCommand(command)) {
      const result = await applyTakeTurn(state, command, await resolveEnv());
      state = result.state;
      effects.push(...result.effects);
      state = settled(found, state, effects);
      continue;
    }
    if (isProvokeCommand(command)) {
      const result = await applyProvoke(state, command, await resolveEnv());
      state = result.state;
      effects.push(...result.effects);
      state = settled(found, state, effects);
      continue;
    }
    if (isResolvingCommand(command)) {
      const result = await applyResolvingCommand(state, command, await resolveEnv());
      state = result.state;
      effects.push(...result.effects);
      state = settled(found, state, effects);
      continue;
    }
    if (command.type === "add_combatants") {
      // Every other command finds a creature by its instance id, so a newcomer that reuses one could never be reached.
      const present = new Set(state.combatants.map((c) => c.instance_id));
      const taken = command.combatants.find((c) => present.has(c.instance_id));
      if (taken) throw new FightCommandError(400, `${taken.instance_id} is already in this fight.`);
    }
    // A plain command, the Rages kept around it (`next_turn` judges the ending turn's Rage first): the apply the browser shares.
    const result = applyWithRageUpkeep(state, command as FightCommand, fightDeps);
    state = result.state;
    effects.push(...result.effects);
  }
  // A played turn bills the judgments its tape holds (the ones a pause carried over included, once); any other bills what was asked (`notes.answered`).
  return { state, effects, rolls, spent, slotsSpent, resourcesSpent, innateSpent, noteTokens: played === null ? null : played.tape.billedTokens() };
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

/**
 * The write that takes a waiting Reaction off the row: whenever the column holds anything (a malformed value too, JSON `false` and `0` included,
 * which a truthiness test would leave behind to lock the next fight), so every other write keeps its shape.
 */
const clearPending = (row: FightRow): { pending_reaction?: null } => (row.pending_reaction !== null && row.pending_reaction !== undefined ? { pending_reaction: null } : {});

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

/** `open` on an encounter with no row, or whose last fight ended: a new fight on the roster the server builds. */
async function openFight(request: CommandRequest, command: Extract<LifecycleCommand, { type: "open" }>, loaded: LoadedFight, deps: BatchDeps): Promise<BatchResult | null> {
  const { combatants, legendaryCaps } = await deps.buildRoster(command.playedMemberId ?? null);
  // The size guard the caller's list used to meet: a fight no table can run, or no one to run it.
  if (combatants.length < 1 || combatants.length > MAX_OPENED_COMBATANTS) {
    throw new FightCommandError(400, `This fight would field ${combatants.length} combatants; a fight needs between 1 and ${MAX_OPENED_COMBATANTS}.`);
  }
  const fresh: StateSource = {
    combatants_live: combatants,
    current_round: 0,
    active_combatant_index: 0,
    events_fired: [],
    lair_fired_rounds: [],
  };
  let state = buildState(loaded, fresh);
  if (Object.keys(legendaryCaps).length > 0) {
    // The same priming the runner applied to a roster it had just built (legendaryActionCaps).
    state = applyFightCommand(state, { type: "prime_legendary_actions", caps: legendaryCaps }, {
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
    is_running: false, ended_at: null, started_at: null, session_id: null, magical_darkness: [], xp_awarded_at: null,
    ...clearPending(loaded.row),
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
    if (command.sessionId !== null && !(await deps.isCampaignSession(command.sessionId))) {
      throw new FightCommandError(400, "That session is not one of this campaign's.");
    }
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
      // Going live again keeps the first start: the note-judgment cap counts from when combat began.
      is_running: true, ended_at: null, started_at: row.started_at ?? deps.nowIso(), session_id: command.sessionId,
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
    const next = { ...writeOf(state, row.applied_command_ids, request.batchId), is_running: false, ended_at: deps.nowIso(), ...clearPending(row) } satisfies FightWrite & Partial<FightLifecycleWrite>;
    const saved = await deps.saveFight(row.id, row.version, next);
    if (!saved) return null;
    const failures = await performAll(clearInitiativeWrites(playerMemberIds(row.combatants_live), deps));
    return resultOf(true, saved.version, next, next, [], failures);
  }

  // end_combat: what the players changed on their own sheets comes first, so the write-back carries what the table really has.
  const { state } = await attempt({ ...request, commands: [] }, loaded, row, deps, noteJudgmentsOf(deps));
  const context = await deps.loadEndContext(command.siteId === undefined ? null : command.siteId);
  // The saved roster is the authority for where the tokens stand: the browser's store does not hear a player moving their own token.
  const writeBack = [...endWriteBack(state.combatants, context, deps), ...xpWrite(state.combatants, loaded, deps)];
  const next = { ...writeOf(state, row.applied_command_ids, request.batchId), is_running: false, ended_at: deps.nowIso(), ...clearPending(row) } satisfies FightWrite & Partial<FightLifecycleWrite>;
  const saved = await deps.saveFight(row.id, row.version, next);
  if (!saved) return null;
  const failures = await performAll(writeBack);
  return resultOf(true, saved.version, next, next, [], failures);
}

/** What the end of a fight writes to the players, the companions and the party's standing: values, so writing them twice changes nothing. */
function endWriteBack(
  combatants: RunCombatant[],
  context: { exploreParty: ExploreParty | null; siteId: string | null },
  deps: BatchDeps,
): Array<{ name: string; run: () => Promise<void> }> {
  const patches = endOfFightPatches({ combatants, tokensAtEnd: combatants, exploreParty: context.exploreParty, siteId: context.siteId });
  return [
    ...patches.partyMembers.map(({ id, patch }) => ({ name: "player_persist", run: () => deps.persistPartyMember(id, patch) })),
    ...patches.companions.map(({ id, patch }) => ({ name: "companion", run: () => deps.persistCompanion(id, patch) })),
    ...(patches.exploreParty ? [{ name: "explore_party", run: () => deps.setExploreParty(patches.exploreParty!) }] : []),
  ];
}

/**
 * A retry of an End combat or Abandon the fight already took: the save is done, but the writes to the characters ran after
 * it and may not have (a failed write is only reported, and the function can die between the two). Every one sets a value,
 * so running them again is safe, and it is the only way they ever happen: a new End combat is refused for a fight that has ended.
 */
async function replayClosing(command: LifecycleCommand, loaded: LoadedFight, row: FightRow, deps: BatchDeps): Promise<string[]> {
  if (row.ended_at === null) return [];
  if (command.type === "abandon") return performAll(clearInitiativeWrites(playerMemberIds(row.combatants_live), deps));
  if (command.type !== "end_combat") return [];
  const context = await deps.loadEndContext(command.siteId === undefined ? null : command.siteId);
  // The award is asked for again too: if the first attempt died before giving it, this is the only time it happens,
  // and if it was given, the database gives nothing the second time.
  return performAll([...endWriteBack(row.combatants_live, context, deps), ...xpWrite(row.combatants_live, loaded, deps)]);
}

/**
 * The XP a won fight gives, in a campaign that levels by experience: the foes' challenge ratings read from the stat
 * blocks they came from (a creature added mid-fight included), summed and shared by `fightXp`. The read happens inside
 * the write, after the fight is saved as ended: a failed read is reported like any write after the save, and never
 * keeps the fight from ending.
 */
function xpWrite(combatants: RunCombatant[], loaded: LoadedFight, deps: BatchDeps): Array<{ name: string; run: () => Promise<void> }> {
  if (!loaded.xpLevelling) return [];
  return [{
    name: "fight_xp",
    run: async () => {
      const foes = combatants.filter((c) => c.type !== "player");
      const monsterIds = [...new Set(foes.flatMap((c) => (c.monster_id === undefined ? [] : [c.monster_id])))];
      const npcIds = [...new Set(foes.flatMap((c) => (c.npc_id === undefined ? [] : [c.npc_id])))];
      const sources = monsterIds.length + npcIds.length > 0 ? await deps.loadStatBlocks({ monsterIds, npcIds, companionIds: [] }) : null;
      const monsterCr = new Map((sources?.monsters ?? []).map((m) => [m.id, m.stat_block.challenge_rating]));
      const npcCr = new Map((sources?.npcs ?? []).map((n) => [n.id, n.stat_block?.challenge_rating ?? null]));
      const award = fightXp(combatants, loaded.factions, (c) =>
        c.monster_id !== undefined ? (monsterCr.get(c.monster_id) ?? null) : c.npc_id !== undefined ? (npcCr.get(c.npc_id) ?? null) : null,
      );
      if (award !== null && award.each > 0) await deps.awardFightXp(award);
    },
  }];
}

/** What a fight that waits for the person's Reaction says to a command that is not the answer. */
const waitingFor = (row: FightRow, pending: PendingReaction): string =>
  `The fight is waiting for ${row.combatants_live.find((c) => c.instance_id === pending.offer.reactorId)?.name ?? "the played character"}'s reaction.`;

/**
 * A fight that waits for the person's Reaction (`pending_reaction`) takes no command but the answer: the paused turn replays from the fight
 * it started from, so anything else that changed it would make the answer play a different turn. What it does take, without changing it:
 * the same turn sent again (a reloaded page, a retried send) is answered with the offer it is waiting on, and a party sync is answered
 * unapplied like any sync that finds nothing to change. End combat, Abandon and `open` (a resume) never reach here. Returns the answer to
 * give, or null when the command is the answer to this very Reaction and the batch should replay the turn.
 * A stored value that is not a pending reaction this code wrote is refused with a 409 that says so (only End combat or Abandon clear it).
 */
function holdsFight(request: CommandRequest, row: FightRow, pending: PendingReaction | "malformed"): BatchResult | null {
  if (pending === "malformed") throw new FightCommandError(409, "The Reaction this fight is waiting for could not be read; end or abandon the fight to clear it.");
  const only = request.commands.length === 1 ? request.commands[0] : null;
  const offered = (): BatchResult => resultOf(false, row.version, row, row, [{ type: "reaction_offered", offer: pending.offer, offerId: pending.offerId }], []);
  if (only !== null && isAnswerReactionCommand(only)) {
    // The retry of the answer that made this pause: the answer is already in, so the offer is shown again, not answered a second time.
    if (pending.answerBatchId === request.batchId) return offered();
    // An answer to an offer the fight has moved past (a second tab that still shows the first Shield of a Multiattack) is refused, never taken for the answer
    // to the one waiting now. Checked on every load, so a lost race that reloads a newer offer meets the same rule.
    if (only.offerId !== pending.offerId) throw new FightCommandError(409, "That reaction was already answered; the fight is waiting on a newer one.");
    return null;
  }
  if (only !== null && isTakeTurnCommand(only) && only.instanceId === pending.command.instanceId) return offered();
  if (only !== null && only.type === "sync_party") return resultOf(false, row.version, row, row, [], []);
  throw new FightCommandError(409, waitingFor(row, pending));
}

/** Every write of what the batches spent on the sheets: one absolute write per member or grant, so a retry lands once. */
function costWrites(spent: SpentCosts, deps: BatchDeps): Array<{ name: string; run: () => Promise<void> }> {
  const last = lastCosts(spent);
  return [
    // The slots an ally's casts used: the last cast's whole list.
    ...last.slots.map((w) => ({ name: "ally_spell_slots", run: () => deps.writeSpellSlots(w.memberId, w.slots) })),
    // The uses an ally's daily-limited innate spells spent: the last count.
    ...last.innate.map((w) => ({ name: "ally_innate_uses", run: () => deps.writeInnateUses(w.memberId, w.spellRowId, w.remaining) })),
    // The limited uses an ally's class features spent: the last whole object.
    ...last.resources.map((w) => ({ name: "ally_class_resources", run: () => deps.writeClassResources(w.memberId, w.resources) })),
  ];
}

/**
 * Finishes the sheet writes an answered Reaction left owed (`owedWrites.ts`): tried again, and the record cleared only when every one landed.
 * `cleared` says the row's version moved (the clearing is an update), so the caller reloads before it saves.
 */
async function settleOwed(row: FightRow, deps: BatchDeps): Promise<{ failures: string[]; cleared: boolean }> {
  const owed = parseOwedWrites(row.owed_writes);
  if (owed === null) return { failures: [], cleared: false };
  if (owed === "malformed") return { failures: ["owed_writes: the saved sheet writes could not be read"], cleared: false };
  const failures = await performAll(costWrites(owed, deps));
  if (failures.length > 0) return { failures, cleared: false };
  const clearing = await performAll([{ name: "owed_writes", run: () => deps.clearOwedWrites(row.id, owed.batchId) }]);
  return { failures: clearing, cleared: clearing.length === 0 };
}

export async function runBatch(request: CommandRequest, deps: BatchDeps): Promise<BatchResult> {
  const settleFailures: string[] = [];
  const result = await runBatchOnce(request, deps, settleFailures);
  return settleFailures.length === 0 ? result : { ...result, effectFailures: [...settleFailures, ...result.effectFailures] };
}

async function runBatchOnce(request: CommandRequest, deps: BatchDeps, settleFailures: string[]): Promise<BatchResult> {
  const notes = noteJudgmentsOf(deps);
  let owedSettled = false;
  const first = request.commands[0];
  const lifecycle = request.commands.length === 1 && LIFECYCLE_TYPES.has(first.type) ? (first as LifecycleCommand) : null;
  for (let tries = 1; tries <= MAX_ATTEMPTS; tries++) {
    const loaded = await deps.loadFight(request.encounterId);
    const { row } = loaded;

    // A Reaction's cost that an earlier batch could not write to the sheet is finished before anything else, even for a retry of that very batch.
    if (row && !owedSettled) {
      owedSettled = true;
      const settled = await settleOwed(row, deps);
      settleFailures.push(...settled.failures);
      if (settled.cleared) {
        tries -= 1;
        continue;
      }
    }

    // The reply of an earlier send may have been lost after it was applied: answer with the state as it is.
    // Before the ended check, so a retried End combat is answered rather than refused for a fight it just ended.
    if (row && row.applied_command_ids.includes(request.batchId)) {
      const failures = lifecycle ? await replayClosing(lifecycle, loaded, row, deps) : [];
      return resultOf(false, row.version, row, row, [], failures);
    }

    const syncOnly = request.commands.length === 1 && request.commands[0].type === "sync_party";
    // A fight that waits for the person's Reaction: End combat, Abandon and a resuming `open` go on (the first two clear it); everything else is held.
    const waiting = row !== null && row.ended_at === null ? parsePendingReaction(row.pending_reaction) : null;
    const closesOrResumes = lifecycle !== null && (lifecycle.type === "end_combat" || lifecycle.type === "abandon" || lifecycle.type === "open");
    if (row && waiting !== null && !closesOrResumes) {
      const held = holdsFight(request, row, waiting);
      if (held !== null) return held;
    }
    if (lifecycle) {
      const result = await runLifecycle(request, lifecycle, loaded, deps);
      if (result) return result;
      continue;
    }
    if (!row) throw new FightCommandError(404, "This encounter has no fight.");
    if (row.ended_at !== null) {
      // The runner asks for a sync whenever a character's row rings, and ending a fight writes those rows: the
      // sync that follows finds the fight over. That is nothing lost, so it is answered, not refused.
      if (syncOnly) return resultOf(false, row.version, row, row, [], []);
      throw new FightCommandError(409, "This fight has ended.");
    }

    // The person's own Reaction: a turn sent with the played member, or the answer to the one that paused, is played through a tape so it can be replayed.
    const only = request.commands.length === 1 ? request.commands[0] : null;
    const answering = only !== null && isAnswerReactionCommand(only) ? only : null;
    if (answering !== null && (waiting === null || waiting === "malformed")) throw new FightCommandError(409, "Nothing is waiting for a reaction.");
    const turn: PendingReaction["command"] | null = answering !== null && waiting !== null && waiting !== "malformed"
      ? waiting.command
      : only !== null && isTakeTurnCommand(only) && only.playedMemberId !== undefined ? (only as PendingReaction["command"]) : null;
    const run = turn === null ? null : answering !== null && waiting !== null && waiting !== "malformed"
      ? playedRunOf([...waiting.answers, answering.answer], waiting.tape, waiting.sheets)
      : playedRunOf([], []);
    let outcome: Awaited<ReturnType<typeof attempt>>;
    try {
      outcome = await attempt(turn === null ? request : { ...request, commands: [turn] }, loaded, row, deps, notes, run);
    } catch (e) {
      if (!(e instanceof ReactionPause) || run === null || turn === null) throw e;
      // The moment is the person's: nothing of the attempt is saved. The row keeps the fight as it was, the offer, the answers so far and the tape,
      // under the same version rule as any save, and the batch id is NOT recorded so a retried send is offered again rather than taken for applied.
      const paused = await deps.saveFight(row.id, row.version, {
        combatants_live: row.combatants_live, current_round: row.current_round, active_combatant_index: row.active_combatant_index,
        events_fired: row.events_fired, lair_fired_rounds: row.lair_fired_rounds, applied_command_ids: row.applied_command_ids,
        pending_reaction: pendingOf(turn, run, e.offer, request.batchId, answering === null ? null : request.batchId),
      });
      if (!paused) continue;
      return resultOf(false, paused.version, row, row, [{ type: "reaction_offered", offer: e.offer, offerId: request.batchId }], []);
    }
    const { state, effects, rolls, spent, slotsSpent, resourcesSpent, innateSpent } = outcome;
    // The answer that finishes the turn also takes the pending Reaction off the row, and records what it still owes the sheets in the same update,
    // so a cost write that fails after the save is finished by the next batch instead of lost (`owedWrites.ts`).
    const spentCosts: SpentCosts = { slots: slotsSpent, innate: innateSpent, resources: resourcesSpent };
    const owed = answering === null ? null : owedOf(request.batchId, spentCosts);
    const write: FightWrite = {
      ...writeOf(state, row.applied_command_ids, request.batchId),
      ...(answering === null ? {} : { pending_reaction: null }),
      ...(owed === null ? {} : { owed_writes: owed }),
    };
    // Most syncs find the sheets as the fight already has them (the ring was this fight's own write to a sheet
    // coming back). Saving anyway would raise the version and ring every screen for nothing, on every hit.
    if (syncOnly && sameFight(row, write)) return resultOf(false, row.version, row, row, [], []);
    const saved = await deps.saveFight(row.id, row.version, write);
    if (!saved) continue;

    const effectFailures = await perform(effects, deps);
    // The rolls are the log's record of what the fight now holds, so they are posted only for the attempt that was saved.
    effectFailures.push(...(await performAll(rolls.map((roll) => ({ name: "roll", run: () => deps.postRoll(roll) })))));
    // What the allies' attacks used up, after the save like the rolls. The weapon is put on the ground before the stack is
    // written, and a drop that failed leaves the stack alone (a weapon is not lost for a post that never happened), as the browser does it.
    for (const { spend, speaker } of spent) {
      const dropFailures = spend.drop === null ? [] : await performAll([{ name: "thrown_drop", run: () => deps.dropThrown(spend.drop as ThrownDrop, spend.memberId, speaker) }]);
      effectFailures.push(...dropFailures);
      if (dropFailures.length === 0) effectFailures.push(...(await performAll([{ name: "ally_gear", run: () => deps.writeGear(spend.writes) }])));
    }
    // What the casts and class features used up on the sheets: absolute writes, so a retry lands once. An answered Reaction's are owed on the row until they land.
    const costFailures = await performAll(costWrites(spentCosts, deps));
    effectFailures.push(...costFailures);
    if (owed !== null && costFailures.length === 0) effectFailures.push(...(await performAll([{ name: "owed_writes", run: () => deps.clearOwedWrites(row.id, request.batchId) }])));
    // Billed after the save, like the rolls, and only for calls that answered: a refused or failed one cost nothing we know of.
    const billed = outcome.noteTokens === null ? notes.answered.map((answer) => answer.inputTokens) : outcome.noteTokens;
    effectFailures.push(...(await performAll(billed.map((inputTokens) => ({ name: "note_judgment", run: () => deps.recordNoteJudgment(inputTokens) })))));
    return resultOf(true, saved.version, row, write, effects, effectFailures);
  }
  throw new FightCommandError(409, "The fight kept changing under this command; try again.");
}
