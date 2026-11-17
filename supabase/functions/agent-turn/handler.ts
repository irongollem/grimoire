// One turn of a conversation with the AI table (#1205): who may run it, what it may cost, the loop, and the save.
//
// No Deno and no Supabase in here. Everything with I/O comes in through `AgentTurnDeps`, so the rules below are
// tested against an in-memory store (`handler.test.ts`) and `index.ts` only wires real dependencies to them.
//
// Two phases, because the HTTP layer must answer a plain JSON status before it opens a stream:
//   `beginTurn`  every gate up to and including moderation and the credit reservation. Returns a refusal (a status
//                and a sentence) or a `run` function. Nothing has been streamed yet.
//   `run`        creates the conversation if it is new, runs the loop, saves, charges, and reports on `send`.
//                Then, after `done` has gone out, it may fold the older messages into the rolling summary
//                (`_shared/agent/summary.ts`): the player never waits for that, and a failure in it is only logged.
// A caller that gets `run` MUST call it: the reservation is released inside it.

import { creditsForUsd, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { runTurn, totalTokens, type TurnEnd } from "../_shared/agent/turn.ts";
import { historyFrom, rowsFor, systemWithSummary, type StoredTurn, type TurnRow } from "../_shared/agent/transcript.ts";
import type { Remembered } from "../_shared/agent/characterTurn.ts";
import type { SpeechToolsDeps } from "../_shared/agent/speak.ts";
import type { SceneView } from "../_shared/agent/scene.ts";
import type { RecordedFact, RecordKind } from "../_shared/agent/record.ts";
import { pressureShown, type QuestMove, type QuestsInPlay } from "../_shared/agent/quests.ts";
import { prologueText, startPlace, type Prologue } from "../_shared/agent/prologue.ts";
import { fightIsTold, type FightPlan, type FightsInView } from "../_shared/agent/fight.ts";
import { askOf, declinedText, rollText, scoreRoll, type PendingRoll, type RollAsk, type Rolled } from "../_shared/agent/playerRoll.ts";
import { makeTurnTools, type FiledFact } from "./turnTools.ts";
import { narrationGate, type NarrationGate, type NarrationJudge } from "./narration.ts";
import { OPENING_TEXT, parseBody, playerText } from "./turnBody.ts";
import type { PlayerCharacter } from "../_shared/agent/playerCharacter.ts";
import { applyKeptQuestMoves, characterOf, foldIntoSummary, questsOf, recordOf, round6, fightsOf, safely, sceneOf, stateFor, systemFor } from "./turnSupport.ts";
import {
  AgentProviderError,
  type AgentLine,
  type AgentTool,
  type AgentUsage,
  type CallModel,
  type CallTool,
  type DmRoll,
} from "../_shared/agent/types.ts";
import type { CreditLogFields } from "../_shared/credits.ts";

// Limits of one turn. The player waits on a turn, and a model that loops on tools can spend a lot without saying
// anything, so each limit has its own reason.
/** A turn is a few model calls (look something up, roll, answer); eight stops a model that keeps calling tools. */
export const MAX_STEPS = 8;
/** A reply of a few sentences is far below this; it stops one runaway answer from costing a whole turn's budget. */
export const MAX_OUTPUT_TOKENS = 2000;
/** Everything the provider billed this turn, cache included. About a dozen times what a usual turn uses. */
export const TOKEN_BUDGET = 60_000;
/** Held before the turn so an account with no credits is refused before any model call; the real charge is metered. */
export const RESERVE_CREDITS = 1;

/** A refusal before the stream opened: an ordinary JSON response. */
export interface Refusal {
  status: number;
  error: string;
}

/** What the browser hears. It never carries a tool's input or result: those can hold DM-only material. */
export type AgentEvent =
  | { type: "session"; sessionId: string; character?: { id: string; name: string } }
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; isError: boolean }
  /** What a character said or visibly did. It is the one thing a tool shows the browser: it is meant for the page. */
  | { type: "line"; line: AgentLine; /** For a spoken line where voices are on: the key `table-voice` speaks it for (lineKey.ts). */ voice?: string }
  /** The party moved. Only the place's id and name: its description and who is there can hold DM-only text. */
  | { type: "scene"; scene: { id: string; name: string } }
  /** A fact the narrator put on record that the player already knows. A hidden one is never sent. */
  | { type: "fact"; fact: { id: string; body: string } }
  /** How full the clock the scene runs against is after this turn, or null when the pressure is off. Never its label. */
  | { type: "pressure"; pressure: { filled: number; segments: number } | null }
  /** A fight has started (the page offers the way to the fight screen), or (null) its aftermath has been told. */
  | { type: "fight"; fight: { encounterId: string; name: string } | null }
  /** A roll the Dungeon Master made in the open. A hidden roll sends nothing. */
  | { type: "dm_roll"; roll: DmRoll }
  /** The story stops for a roll that is the player's. What to roll, never the number to beat. */
  | { type: "ask_roll"; roll: RollAsk }
  /** The roll this turn answered, as the server worked it out. No outcome: the narration says how it went. */
  | { type: "rolled"; roll: Rolled }
  | { type: "done"; end: TurnEnd; credits: number; tokens: number }
  | { type: "error"; message: string };

export interface CampaignRow {
  id: string;
  user_id: string;
  name: string;
  game_system: string | null;
  ai_enabled: boolean | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  campaign_id: string;
  summary: string | null;
  summary_through_seq: number;
  /** Where the party is; null until the narrator first calls go_to. */
  scene_location_id: string | null;
  /** The play session this conversation is a sitting of; what the table writes into the campaign is stamped with it. */
  campaign_session_id: string | null;
  /** The quest clock this conversation ticks by one every kept turn; null when the scene is under no pressure. */
  pressure_clock_id: string | null;
  /** The party member the player plays; null when the conversation was begun without one. */
  party_member_id: string | null;
  /** True when this conversation started its play session; false when it joined one that was already open. */
  opened_play_session: boolean;
  /** When the player left the table; null while the sitting goes on. A conversation that was left takes no turns. */
  left_at: string | null;
  /** The roll the narrator asked the player for at the end of the last kept turn; null when none is asked. */
  pending_roll: PendingRoll | null;
  /** The encounter this conversation started and is waiting on; null when the story is not in a fight. */
  fight_encounter_id: string | null;
}

export interface ResolvedProvider {
  provider: string;
  model: string;
  /** The campaign's own key pays. */
  isByok: boolean;
  /** Null when the provider has no adapter yet. */
  callModel: CallModel | null;
}

export type Reservation = { ok: true; ids: string[] } | { ok: false; refusal: Refusal };

export interface AgentTurnDeps {
  /** Suspended or child accounts. */
  accountRefusal(userId: string): Promise<Refusal | null>;
  loadCampaign(campaignId: string): Promise<CampaignRow | null>;
  /** The owner or a co-DM. */
  isDm(campaign: CampaignRow, userId: string): Promise<boolean>;
  /** By id alone: the handler decides whether it belongs to the caller. */
  loadSession(sessionId: string): Promise<SessionRow | null>;
  createSession(input: {
    userId: string;
    campaignId: string;
    provider: string;
    model: string;
    sceneLocationId: string | null;
    campaignSessionId: string | null;
    /** Whether the conversation started that session itself (see `SessionRow.opened_play_session`). */
    openedPlaySession: boolean;
    partyMemberId: string | null;
  }): Promise<SessionRow>;
  /**
   * The campaign's open play session, started if there is none: sitting down at the table is the game being played.
   * `opened` says whether this call started it (false: the DM already had one running and the table joined it), which
   * is what decides at the end whether leaving the table may close it. Null when it could not be opened; the
   * conversation then runs without one and what it writes carries no session.
   */
  openPlaySession(campaignId: string): Promise<{ id: string; opened: boolean } | null>;
  loadTurns(sessionId: string): Promise<StoredTurn[]>;
  rateLimit(userId: string): Promise<boolean>;
  resolveProvider(campaign: CampaignRow): Promise<ResolvedProvider | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  /** True when the message must not be sent. Fails open (false) when the check cannot run. */
  isFlagged(message: string): Promise<boolean>;
  reserve(userId: string, credits: number): Promise<Reservation>;
  release(ids: string[]): Promise<void>;
  /** `recordGeneration`: BYOK writes a zero row, otherwise spends `cost`. */
  recordGeneration(isByok: boolean, cost: number, log: CreditLogFields): Promise<void>;
  /** `recordFreeGeneration`: a zero-credit ledger row that still says the platform paid the provider. */
  recordFreeGeneration(log: CreditLogFields): Promise<void>;
  /**
   * `append_agent_turns`. `due` is the whole credits the conversation's running total newly crossed, decided in SQL
   * under the row lock. "conflict" is SQLSTATE 40001: the conversation moved on. Any other failure throws.
   */
  appendTurns(sessionId: string, afterSeq: number, rows: TurnRow[], credits: number): Promise<{ due: number } | "conflict">;
  /**
   * `summarise_agent_session`: stores the summary and the seq it covers, adds the summary call's tokens and accrual,
   * and answers with the whole credits newly crossed. "stale" is SQLSTATE 40001: another summary got there first.
   * Any other failure throws.
   */
  saveSummary(input: {
    sessionId: string;
    expectedThroughSeq: number;
    throughSeq: number;
    summary: string;
    usage: AgentUsage;
    credits: number;
  }): Promise<{ due: number } | "stale">;
  tools: AgentTool[];
  callTool: CallTool;
  /**
   * Files what characters chose to remember this turn in their memory ledgers (`npc_memories`), marked as written
   * by AI. Called only after the turn itself was saved: a moment that was not kept leaves no memory.
   */
  saveMemories(input: {
    campaignId: string;
    userId: string;
    provider: string;
    model: string;
    memories: Array<{ characterId: string } & Remembered>;
    /** The sitting it happened in, so "what did she promise last time" has an answer. */
    campaignSessionId: string | null;
  }): Promise<void>;
  /**
   * A character of this campaign as its own call may know it: its record and its memories, nothing else. Null when
   * the id is not a character of THIS campaign, whoever asks.
   */
  loadSpeaker(campaignId: string, characterId: string): ReturnType<SpeechToolsDeps["loadSpeaker"]>;
  /** A character of THIS campaign as the narrator may know them. Null when the id is not a character of this campaign. */
  loadCharacter(campaignId: string, characterId: string): Promise<PlayerCharacter | null>;
  /** A place of THIS campaign with the people in it, as the narrator may know them. Null when it is not in the campaign. */
  loadScene(campaignId: string, locationId: string): Promise<SceneView | null>;
  /**
   * Moves the party: stores the place on the conversation and answers with the new scene. Null when the place is not
   * in this campaign or the move could not be stored. It writes at once, outside the turn's own save.
   */
  setScene(sessionId: string, campaignId: string, locationId: string): Promise<SceneView | null>;
  /** The fights prepared at the party's place and the one this conversation started, as it stands. */
  loadFights(campaignId: string, locationId: string | null, fightEncounterId: string | null): Promise<FightsInView>;
  /** Starts the fight the narrator asked for and points the conversation at it. Throws when it could not. */
  startFight(
    ctx: { campaignId: string; sessionId: string; userId: string; memberId: string; locationId: string | null; playSessionId: string | null },
    plan: FightPlan,
  ): Promise<{ encounterId: string; name: string }>;
  /** Lets the conversation go of its fight (null), once its aftermath has been told. */
  setFight(sessionId: string, campaignId: string, encounterId: string | null): Promise<void>;
  /**
   * The campaign's opening quest at its entry beat, when the story has not begun: no turn has ever been kept at the
   * table in this campaign. Null once it has, and when the campaign names no opening quest (or one that is gone).
   */
  loadPrologue(campaignId: string): Promise<Prologue | null>;
  /** Puts the opening quest in play at its entry beat, unless it already has a thread. Throws when it could not. */
  beginPrologue(campaignId: string, prologue: Prologue): Promise<void>;
  /**
   * Shows the played character the place the party stands in and the people who spoke or acted in front of them,
   * through the campaign's own sharing (`reveals.ts`). Throws when it could not be written.
   */
  revealToCharacter(input: { campaignId: string; memberId: string; locationId: string | null; characterIds: string[] }): Promise<void>;
  /** Writes (or, with null, clears) the roll the player is asked for. Throws when it could not be written. */
  setPendingRoll(sessionId: string, campaignId: string, pending: PendingRoll | null): Promise<void>;
  /**
   * The facts worth putting in front of the narrator this turn: those tied to the place and the people in it, and the
   * newest of the campaign, oldest first, none of them closed by a later fact.
   */
  loadRecord(campaignId: string, about: { locationId: string | null; characterIds: string[] }): Promise<RecordedFact[]>;
  /**
   * Puts one fact on record with its ties, at once: the narrator needs its id back in the same turn to close it
   * later. `{ error }` is a sentence the narrator can act on. Writes as the DM who is playing, never as the server.
   */
  fileFact(input: {
    campaignId: string;
    campaignSessionId: string | null;
    agentSessionId: string;
    provider: string;
    model: string;
    fact: string;
    about: { type: RecordKind; id: string }[];
    hidden: boolean;
    closes: string | null;
  }): Promise<{ id: string } | { error: string }>;
  /** The recorded characters of this campaign whose name or disguise holds this text, by the name they are shown under. */
  findCharacters(campaignId: string, name: string): Promise<Array<{ id: string; shownName: string }>>;
  /**
   * Puts characters where the party is. A character who just spoke to the party is evidently there, whatever
   * their record said, and the next sitting must find them in the place it reads.
   */
  placeCharacters(campaignId: string, locationId: string, characterIds: string[]): Promise<void>;
  /** Takes facts filed in a turn that was not kept off the record again. */
  discardFacts(campaignId: string, ids: string[]): Promise<void>;
  /** The quests running in the campaign, what the narrator may mark, and where the pressure clock stands. */
  loadQuests(campaignId: string, pressureClockId: string | null): Promise<QuestsInPlay>;
  /**
   * Applies one quest move through the same database functions the quest screen calls. Called only after the turn
   * was saved, in the order the moves were made; throws on any failure.
   */
  applyQuestMove(ctx: { campaignId: string; agentSessionId: string }, move: QuestMove): Promise<void>;
  /**
   * Judges, with TypeSafe's Jev, whether narration told the player anything the characters' lines did not
   * (`narration.ts`). Null when no judging key is available: then every word the narrator writes is shown.
   */
  judgeNarration: NarrationJudge | null;
  /**
   * Signs a spoken line so it can be voiced as soon as it is shown (`lineKey.ts`). Null where voices are not
   * switched on: then no line carries a key and nothing can be voiced.
   */
  voiceKey: ((sessionId: string, line: AgentLine) => string) | null;
  /** The names of the campaign's own peoples (its species), for `peoples.ts`. */
  loadPeoples(campaignId: string): Promise<string[]>;
  /** The names of a planned fight's creatures that have no stat block; a fight with one of them is not started. */
  statlessFighters(campaignId: string, plan: FightPlan): Promise<string[]>;
}

export const MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That conversation was not found.",
  left: "You left this table. Sit down again to play on.",
  noRoll: "No roll was asked for.",
  noPlace: "That place was not found.",
  noCharacter: "That character was not found.",
  noCampaign: "Campaign not found.",
  aiOff: "AI is disabled for this campaign.",
  forbidden: "Only the campaign's DM can use the AI table.",
  rateLimited: "rate_limited",
  noProvider: "The AI table is not available right now.",
  noAdapter: "The AI table is not available on this provider yet.",
  noMetering: "The AI table cannot be metered right now.",
  flagged: "That message cannot be sent to the AI table.",
  conflict: "This conversation was continued somewhere else. Reload it and send your message again.",
  providerBusy: "The AI provider is busy right now. Send your message again in a moment.",
  failed: "The AI table ran into a problem. Send your message again.",
  notSaved: "The turn could not be saved. Send your message again.",
} as const;

export type BegunTurn =
  | { kind: "refused"; refusal: Refusal }
  | { kind: "ready"; run: (send: (event: AgentEvent) => void, signal?: AbortSignal) => Promise<void> };

export async function beginTurn(input: {
  userId: string;
  body: unknown;
  deps: AgentTurnDeps;
}): Promise<BegunTurn> {
  const { userId, deps } = input;
  const refuse = (status: number, error: string): BegunTurn => ({ kind: "refused", refusal: { status, error } });

  const parsed = parseBody(input.body);
  if (!parsed.ok) return refuse(400, MESSAGES.badBody);
  const body = parsed.body;

  const account = await deps.accountRefusal(userId);
  if (account) return { kind: "refused", refusal: account };

  const campaign = await deps.loadCampaign(body.campaignId);
  if (!campaign) return refuse(404, MESSAGES.noCampaign);
  if (campaign.ai_enabled !== true) return refuse(403, MESSAGES.aiOff);
  if (!(await deps.isDm(campaign, userId))) return refuse(403, MESSAGES.forbidden);

  // Someone else's conversation, or one in another campaign, is "not found": a 403 would say it exists.
  let existing: SessionRow | null = null;
  if (body.sessionId !== undefined) {
    existing = await deps.loadSession(body.sessionId);
    if (!existing || existing.user_id !== userId || existing.campaign_id !== campaign.id) {
      return refuse(404, MESSAGES.notFound);
    }
    // Before the rate limit and the reservation: a sitting that was left takes nothing more, and costs nothing to refuse.
    if (existing.left_at !== null) return refuse(409, MESSAGES.left);
  }
  // A roll answers a request: without one there is no DC to score it against, and a made-up roll must not reach the
  // narrator as if it had been asked for.
  const pendingRoll = existing === null ? null : existing.pending_roll;
  if (body.roll !== undefined && pendingRoll === null) return refuse(400, MESSAGES.noRoll);
  const scored = body.roll !== undefined && pendingRoll !== null ? scoreRoll(pendingRoll, body.roll) : null;

  // Before anything is charged or streamed: a place of another campaign, or one that does not exist, is "not
  // found" either way. The id comes from the browser, so it is checked against the conversation's campaign here.
  if (body.startLocationId !== undefined && !(await deps.loadScene(campaign.id, body.startLocationId))) {
    return refuse(404, MESSAGES.noPlace);
  }

  // Same for the character: the id comes from the browser, so it is checked against the campaign before anything is reserved.
  if (body.characterId !== undefined && !(await deps.loadCharacter(campaign.id, body.characterId))) {
    return refuse(404, MESSAGES.noCharacter);
  }

  if (!(await deps.rateLimit(userId))) return refuse(429, MESSAGES.rateLimited);

  const provider = await deps.resolveProvider(campaign);
  if (!provider) return refuse(503, MESSAGES.noProvider);
  if (!provider.callModel) return refuse(503, MESSAGES.noAdapter);
  const callModel = provider.callModel;

  // Play must never run unmetered. Own-key play is not charged, so it needs neither number.
  let price: ModelPrice | null = null;
  let calibration: CreditCalibration | null = null;
  if (!provider.isByok) {
    try {
      price = await deps.loadPrice(provider.model);
      const found = await deps.loadCalibration();
      if (found && found.usdPerCredit !== null && Number.isFinite(found.usdPerCredit) && found.usdPerCredit > 0 &&
        Number.isFinite(found.margin) && found.margin > 0) {
        calibration = { usdPerCredit: found.usdPerCredit, margin: found.margin };
      }
    } catch (error) {
      console.error("agent-turn: metering lookup failed:", error);
      return refuse(503, MESSAGES.noMetering);
    }
    if (!price || !calibration) return refuse(503, MESSAGES.noMetering);
  }

  let flagged = false;
  try {
    // A roll sent without words has nothing to screen.
    flagged = body.message === "" ? false : await deps.isFlagged(body.message);
  } catch (error) {
    // Same stance as the image screen: it is not the safety boundary, so an outage of it must not stop play.
    console.error("agent-turn: moderation failed:", error);
  }
  if (flagged) return refuse(400, MESSAGES.flagged);

  let reservationIds: string[] = [];
  if (!provider.isByok) {
    const reservation = await deps.reserve(userId, RESERVE_CREDITS);
    if (!reservation.ok) return { kind: "refused", refusal: reservation.refusal };
    reservationIds = reservation.ids;
  }

  const run = async (send: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> => {
    // A listener that throws (a closed stream) must not cost the player the turn that is already paid for.
    const emit = (event: AgentEvent) => {
      try {
        send(event);
      } catch {
        // ignored on purpose
      }
    };

    // Facts are written the moment the narrator files them, before the turn is saved. A turn that is not kept is
    // sent again by the player, and the narrator would file the same facts a second time, so they come off again.
    const filed: FiledFact[] = [];
    let kept = false;
    // Quest moves the narrator made this turn. Objectives and clocks have no undo, so none is written until the turn is kept.
    const queued: QuestMove[] = [];
    // The roll the narrator asked the player for this turn; written only once the turn is kept.
    let asked: PendingRoll | null = null;
    const discardFiled = async (): Promise<void> => {
      if (filed.length === 0) return;
      await safely(() => deps.discardFacts(campaign.id, filed.map((f) => f.id)));
    };

    try {
      let session: SessionRow;
      let stored: StoredTurn[];
      let result;
      let gate: NarrationGate | null = null;
      try {
        // The campaign's very first sitting begins at its opening quest. Read for a new conversation only; a
        // failure is logged and the sitting begins as any other does.
        let prologue: Prologue | null = null;
        if (!existing) {
          try {
            prologue = await deps.loadPrologue(campaign.id);
          } catch (error) {
            console.error("agent-turn: reading the campaign's opening failed:", error);
          }
        }
        // Only a new conversation opens a session: one conversation is one sitting, and it keeps the session it began in.
        let playSession: { id: string; opened: boolean } | null = null;
        if (!existing) {
          try {
            playSession = await deps.openPlaySession(campaign.id);
          } catch (error) {
            console.error("agent-turn: opening the play session failed:", error);
          }
        }
        session = existing ?? await deps.createSession({
          userId,
          campaignId: campaign.id,
          provider: provider.provider,
          model: provider.model,
          sceneLocationId: startPlace(body.startLocationId, prologue),
          campaignSessionId: playSession === null ? null : playSession.id,
          openedPlaySession: playSession !== null && playSession.opened,
          partyMemberId: body.characterId === undefined ? null : body.characterId,
        });
        // Before the quests are read for this turn, so the narrator sees the opening quest in play. Idempotent, so
        // a first turn that is not kept and is sent again does not open it twice.
        if (prologue !== null) {
          const opening = prologue;
          await safely(() => deps.beginPrologue(campaign.id, opening));
        }
        const character = await characterOf(deps, campaign.id, session.party_member_id);
        emit({ type: "session", sessionId: session.id, ...(character ? { character: { id: character.id, name: character.name } } : {}) });
        if (scored !== null) emit({ type: "rolled", roll: scored.rolled });
        stored = await deps.loadTurns(session.id);
        const lastSeqLoaded = stored.reduce((max, row) => Math.max(max, row.seq), 0);
        const history = historyFrom(stored, session.summary_through_seq);
        // The instructions hold nothing that changes during play; the scene, the quests and the record go at the head
        // of the new message instead (`stateFor`), because a changed instruction costs the whole prompt cache.
        const scene = await sceneOf(deps, campaign.id, session.scene_location_id);
        // Quests sit between the scene and the record: they change when something is marked, like the scene when the
        // party moves, and the summary, which only grows, stays last.
        const questState = await questsOf(deps, campaign.id, session.pressure_clock_id);
        const record = await recordOf(deps, campaign.id, scene);
        // Fights: what is prepared here and the one this conversation is waiting on. Unreadable means no fight
        // tool this turn, since the ids it would be asked to name could not be checked.
        const fights = await fightsOf(deps, campaign.id, session.scene_location_id, session.fight_encounter_id);
        // The world's peoples are common knowledge for the narrator and every character. Unreadable costs that
        // knowledge for a turn, never the turn.
        let peoples: string[] = [];
        try {
          peoples = await deps.loadPeoples(campaign.id);
        } catch (error) {
          console.error("agent-turn: reading the world's peoples failed:", error);
        }
        const system = systemWithSummary(systemFor({ campaign, character, peoples }), session.summary);
        const state = stateFor({ scene, quests: questState, record, fights });
        // The fight the narrator starts this turn; started only once the turn is kept.
        let fightPlan: FightPlan | null = null;
        const turnTools = makeTurnTools({
          deps,
          campaignId: campaign.id,
          session,
          stored,
          provider: provider.provider,
          model: provider.model,
          callModel,
          signal,
          onMove: (place) => emit({ type: "scene", scene: place }),
          filed,
          quests: questState === null ? null : { state: questState, queued },
          playerName: character ? character.name : undefined,
          peoples,
          // Only a played character has a sheet to roll from; without one the narrator rolls as before.
          askRoll: character ? (pending) => { asked = pending; } : null,
          // A fight needs someone to fight it: offered only with a played character and readable fights.
          fight: character && fights !== null
            ? { view: fights, onStart: (plan) => { fightPlan = plan; }, statless: (plan) => deps.statlessFighters(campaign.id, plan) }
            : null,
        });

        const sessionId = session.id;
        gate = narrationGate({
          judge: deps.judgeNarration,
          // Only what a character SAID is voiced, and only a line that is being shown gets a key.
          emit: (event) =>
            emit(
              event.type === "line" && event.line.kind === "spoken" && deps.voiceKey !== null
                ? { ...event, voice: deps.voiceKey(sessionId, event.line) }
                : event,
            ),
        });
        result = await runTurn({
          system,
          state,
          history,
          // The roll (or that it was not made) comes first, then the player's own words when there are any.
          user: [
            scored !== null && pendingRoll !== null ? rollText(pendingRoll, scored) : pendingRoll !== null ? declinedText(pendingRoll) : null,
            // The campaign's own opening stands in for the ordinary one; given both, the narrator kept to the ordinary.
            body.opening === true ? (prologueText(prologue) ?? OPENING_TEXT) : null,
            body.message === "" ? null : playerText(body.mode, body.message),
          ].filter((part): part is string => part !== null).join("\n\n"),
          ...(body.message === "" ? {} : { player: { kind: body.mode, text: body.message } }),
          ...(scored === null ? {} : { roll: scored.rolled }),
          tools: turnTools.tools,
          callModel,
          callTool: turnTools.callTool,
          limits: { maxSteps: MAX_STEPS, maxOutputTokens: MAX_OUTPUT_TOKENS, tokenBudget: TOKEN_BUDGET },
          signal,
          onEvent: gate.onEvent,
        });
        // Held narration is judged and everything queued reaches the browser before anything after it is sent.
        await gate.finish();
        gate.applyShown(result.added);

        const { steps } = result;
        // Every model call that was billed: the narrator's, and the ones a character's speech made.
        const billed = [...steps, ...result.toolSteps.map((t) => t.usage)];
        const tokens = totalTokens(billed);
        // Nothing was used (stopped before the first model call): there is nothing to save or to charge.
        if (steps.length === 0) {
          emit({ type: "done", end: result.end, credits: 0, tokens: 0 });
          return;
        }

        let accrued = 0;
        if (!provider.isByok && price && calibration) {
          accrued = round6(creditsForUsd(usdForSteps(billed, price), calibration));
        }

        // ledger input_tokens is ALL input (full rate, cache read and cache write): CreditLogFields has no cached
        // field. The exact split is on the agent_turns rows.
        const last = steps[steps.length - 1];
        const logFields: CreditLogFields = {
          model: last.model,
          provider: last.provider,
          input_tokens: billed.reduce((n, s) => n + s.inputTokens + s.cacheReadTokens + s.cacheWriteTokens, 0),
          output_tokens: billed.reduce((n, s) => n + s.outputTokens, 0),
        };
        // Tokens were spent whether or not they are billed, so they are always logged. A cost of 0 writes no row
        // through recordGeneration, which is why a free turn goes through recordFreeGeneration.
        const logWithoutCharge = () =>
          provider.isByok ? deps.recordGeneration(true, 0, logFields) : deps.recordFreeGeneration(logFields);

        const rows = rowsFor({
          sessionId: session.id,
          userId,
          lastSeq: lastSeqLoaded,
          added: result.added,
          steps,
          toolSteps: result.toolSteps,
        });

        // Save first, then charge: a turn that was not kept is not billed.
        let saved: { due: number } | "conflict" | "failed";
        try {
          saved = await deps.appendTurns(session.id, lastSeqLoaded, rows, accrued);
        } catch (error) {
          console.error("agent-turn: saving the turn failed:", error);
          saved = "failed";
        }
        if (saved === "conflict" || saved === "failed") {
          await discardFiled();
          await safely(logWithoutCharge);
          emit({ type: "error", message: saved === "conflict" ? MESSAGES.conflict : MESSAGES.notSaved });
          return;
        }

        kept = true;
        const { due } = saved;
        if (due > 0 || provider.isByok) {
          await safely(() => deps.recordGeneration(provider.isByok, due, logFields));
        } else {
          await safely(() => deps.recordFreeGeneration(logFields));
        }
        // Whoever spoke to the party is where the party is. Written with the kept turn, like their memories.
        const here = turnTools.place();
        if (here !== null && turnTools.spoke.size > 0) {
          await safely(() => deps.placeCharacters(campaign.id, here, [...turnTools.spoke]));
        }
        // What play reveals: the played character has now seen this place and met whoever spoke in front of them.
        // Only for a played character, and only with the kept turn. A failure costs a reveal, never the turn.
        if (session.party_member_id !== null && (here !== null || turnTools.spoke.size > 0)) {
          const memberId = session.party_member_id;
          await safely(() => deps.revealToCharacter({ campaignId: campaign.id, memberId, locationId: here, characterIds: [...turnTools.spoke] }));
        }
        // Kept only now that the turn is: what a character carries away from a moment the player never got to keep
        // would be a memory of something that did not happen. A failure here costs a memory, never the turn.
        if (turnTools.remembered.length > 0) {
          await safely(() =>
            deps.saveMemories({
              campaignId: campaign.id,
              userId,
              provider: provider.provider,
              model: provider.model,
              memories: turnTools.remembered,
              campaignSessionId: session.campaign_session_id,
            })
          );
        }
        // Only now: a turn that was not kept leaves the quests untouched, and the player's retry makes the moves again.
        if (questState !== null) {
          await applyKeptQuestMoves({
            deps,
            ctx: { campaignId: campaign.id, agentSessionId: session.id },
            state: questState,
            queued,
          });
          // Told only when there is or was a clock: a table that never comes under pressure hears nothing of it.
          const shown = pressureShown(questState, queued);
          if (shown !== null || questState.pressure !== null) emit({ type: "pressure", pressure: shown });
        }
        // A fight starts with the kept turn, and the page is told only once it exists. The other way round: once the
        // narrator has been told a fight is over, the conversation lets go of it.
        const planned = fightPlan as FightPlan | null;
        if (planned !== null && session.party_member_id !== null) {
          try {
            const started = await deps.startFight(
              { campaignId: campaign.id, sessionId: session.id, userId, memberId: session.party_member_id, locationId: here, playSessionId: session.campaign_session_id },
              planned,
            );
            emit({ type: "fight", fight: started });
          } catch (error) {
            console.error("agent-turn: starting the fight failed:", error);
          }
        } else if (fights !== null && fightIsTold(fights.fight)) {
          await safely(() => deps.setFight(session.id, campaign.id, null));
          emit({ type: "fight", fight: null });
        }
        // A request to roll lasts one turn: this turn answered or dropped the last one, and may have made a new one.
        // The page is told only when the request is stored, or the roll it sends back would be refused.
        const nowAsked = asked as PendingRoll | null;
        if (nowAsked !== null || pendingRoll !== null) {
          try {
            await deps.setPendingRoll(session.id, campaign.id, nowAsked);
            if (nowAsked !== null) emit({ type: "ask_roll", roll: askOf(nowAsked) });
          } catch (error) {
            console.error("agent-turn: storing the roll that was asked for failed:", error);
          }
        }
        // A fact the player has not learned yet never leaves the server: the page shows only what is known.
        for (const fact of filed) if (!fact.hidden) emit({ type: "fact", fact: { id: fact.id, body: fact.body } });
        // `credits` is this turn's own. A summary's credit shows on the ledger, not in the turn that happened to
        // trigger it.
        emit({ type: "done", end: result.end, credits: due, tokens });

        // After `done`, never before: the player must not wait for housekeeping. An abort is the player leaving.
        if (result.end !== "aborted") {
          const storedNow: StoredTurn[] = [
            ...stored,
            ...rows.map((r) => ({ seq: r.seq, role: r.role, blocks: r.blocks })),
          ];
          await foldIntoSummary({ deps, session, storedNow, callModel, isByok: provider.isByok, price, calibration });
        }
        return;
      } catch (error) {
        // Nothing is saved and nothing charged. The provider's own message can name the model, the key's
        // organisation or the quota, so the browser gets a sentence of ours; the real one goes to the log.
        console.error("agent-turn: the turn failed:", error);
        // Whatever was already queued for the browser goes out before the error, never after it.
        await safely(async () => void (await gate?.finish()));
        if (!kept) await discardFiled();
        emit({
          type: "error",
          message: error instanceof AgentProviderError && error.retryable ? MESSAGES.providerBusy : MESSAGES.failed,
        });
        return;
      }
    } finally {
      // Every outcome: success, failure, conflict, abort.
      await safely(() => deps.release(reservationIds));
    }
  };

  return { kind: "ready", run };
}

/** The whole turn in one call, for a caller that does not need to answer a status before streaming (the tests). */
export async function handleAgentTurn(input: {
  userId: string;
  body: unknown;
  deps: AgentTurnDeps;
  send: (event: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<Refusal | null> {
  const begun = await beginTurn({ userId: input.userId, body: input.body, deps: input.deps });
  if (begun.kind === "refused") return begun.refusal;
  await begun.run(input.send, input.signal);
  return null;
}
