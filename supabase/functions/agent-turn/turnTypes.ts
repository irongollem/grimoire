// The shapes and fixed words of one AI-table turn (#1205): its limits, the refusals, what the browser hears, the rows
// and the dependencies. They live apart from `handler.ts` so each step of a turn (`admitTurn.ts`, `turnSitting.ts`,
// `turnContext.ts`, `keepTurn.ts`) can name them without importing the module that calls it. Callers import them
// from here; `handler.ts` exports only the two entry points.

import type { CanonStore } from "./canonIo.ts";
import type { SiteState } from "../_shared/agent/site.ts";
import type { SceneMemory } from "../_shared/agent/memories.ts";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe.ts";
import type { AgentProvider } from "../_shared/agent/providerIo.ts";
import type { Floor } from "../_shared/agent/floor.ts";
import type { HandoutOffer, PictureOf, Shown } from "../_shared/agent/show.ts";
import type { TravelMap } from "../_shared/agent/travel.ts";
import type { LootHeld } from "../_shared/agent/encounterLoot.ts";
import type { FightChange } from "../_shared/agent/fightChange.ts";
import type { HazardRules, KeptHazard } from "../_shared/agent/hazard.ts";
import type { Companion } from "../_shared/agent/companions.ts";
import type { KeyedLine } from "../_shared/agent/lineKey.ts";
import type { HandsStore } from "./handsIo.ts";
import type { Introduction } from "../_shared/agent/introduce.ts";
import type { ModelPrice } from "../_shared/agent/metering.ts";
import type { TurnEnd } from "../_shared/agent/turn.ts";
import type { StoredTurn, TurnRow } from "../_shared/agent/transcript.ts";
import type { Remembered } from "../_shared/agent/characterTurn.ts";
import type { SpeechToolsDeps } from "../_shared/agent/speak.ts";
import type { SceneView } from "../_shared/agent/scene.ts";
import type { RecordedFact, RecordKind } from "../_shared/agent/record.ts";
import type { DatePoint } from "../_shared/npcAge.ts";
import type { QuestMove, QuestsInPlay } from "../_shared/agent/quests.ts";
import type { Prologue } from "../_shared/agent/prologue.ts";
import type { FightPlan, FightsInView } from "../_shared/agent/fight.ts";
import type { PendingRoll, RollAsk, Rolled } from "../_shared/agent/playerRoll.ts";
import type { NarrationJudge } from "./narration.ts";
import type { PlayerCharacter } from "../_shared/agent/playerCharacter.ts";
import type { AgentLine, AgentTool, AgentUsage, CallTool, DmRoll } from "../_shared/agent/types.ts";
import type { JobLedger } from "../_shared/pipeline/creditHold.ts";

// Limits of one turn. The player waits on a turn, and a model that loops on tools can spend a lot without saying
// anything, so each limit has its own reason.
/** A turn is a few model calls (look something up, roll, answer); eight stops a model that keeps calling tools. */
export const MAX_STEPS = 8;
/** A reply of a few sentences is far below this; it stops one runaway answer from costing a whole turn's budget. */
export const MAX_OUTPUT_TOKENS = 2000;
/**
 * What a turn may spend, in full-rate tokens: cache reads count at a tenth (`budgetTokens`), as they cost. A usual
 * turn in a long sitting is three or four steps of some 20,000 tokens, nearly all of it cache reads, so about
 * 10,000 of these; the budget is several times that and still stops a turn that loops.
 */
export const TOKEN_BUDGET = 60_000;
/** Held before the turn so an account with no credits is refused before any model call (`withCreditHold`); the real charge is metered. */
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
  | { type: "line"; line: AgentLine; /** Where voices are on: the key `table-voice` speaks it for (lineKey.ts), a spoken line in the character's voice and a deed in the narrator's. */ voice?: string }
  /** The party moved. Only the place's id and name: its description and who is there can hold DM-only text. */
  | { type: "scene"; scene: { id: string; name: string } }
  /** A fact the narrator put on record that the player already knows. A hidden one is never sent. */
  | { type: "fact"; fact: { id: string; body: string } }
  /** How full the clock the scene runs against is after this turn, or null when the pressure is off. Never its label. */
  | { type: "pressure"; pressure: { filled: number; segments: number } | null }
  /** A fight has started (the page offers the way to the fight screen), or (null) its aftermath has been told. */
  | { type: "fight"; fight: { encounterId: string; name: string } | null; /** With null: it was never fought (nobody in it could be), not finished. */ calledOff?: true }
  /** A roll the Dungeon Master made in the open. A hidden roll sends nothing. */
  | { type: "dm_roll"; roll: DmRoll }
  /** A handout handed over or a picture shown, in its place in the story. */
  | { type: "shown"; shown: Shown }
  /** The story stops for a roll that is the player's. What to roll, never the number to beat. */
  | { type: "ask_roll"; roll: RollAsk }
  /** The roll this turn answered, as the server worked it out. No outcome: the narration says how it went. */
  | { type: "rolled"; roll: Rolled }
  /** The narrator's ruling changes the fight on the board: the page carries it out. */
  | { type: "fight_change"; change: FightChange }
  /** Someone the narrator made up now has a record the player's character knows of. A hidden one is never sent. */
  | { type: "introduced"; person: { id: string; name: string } }
  /** Words that are not a character's line and can be voiced: the narrator's, whole, or the player's own said line. */
  | { type: "voice"; role: "narrator" | "player"; text: string; voice: string }
  /** Something changed hands: a line for the story's margin. The pack and the purse follow by themselves. */
  | { type: "hands"; text: string }
  /** The played character's hit points changed outside a fight: what did it, by how much, and where they stand. */
  | { type: "hit_points"; change: { change: "heal" | "harm"; why: string; by: number; hp: number; maxHp: number } }
  /** `floor` is "characters" when they were still talking among themselves and nothing waits on the player (`floor.ts`). */
  | { type: "done"; end: TurnEnd; credits: number; tokens: number; floor?: Floor }
  /** `withheld` is set when the turn was dropped by the screen on what the table may tell, so the page can say so. */
  | { type: "error"; message: string; withheld?: true };

export interface CampaignRow {
  id: string;
  user_id: string;
  name: string;
  game_system: string | null;
  ai_enabled: boolean | null;
  /** The campaign's date as its calendar names it; null when no date is set. Per-turn state, never standing text. */
  today?: string | null;
  /** The same date as numbers, for what a kept turn performs on today's date; null when no date is set. */
  date?: DatePoint | null;
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
  /** When the row last changed, which every kept turn does: how long the table has stood idle. */
  updated_at: string;
  /** The roll the narrator asked the player for at the end of the last kept turn; null when none is asked. */
  pending_roll: PendingRoll | null;
  /** The encounter this conversation started and is waiting on; null when the story is not in a fight. */
  fight_encounter_id: string | null;
  /** The fight the party got away from whose creatures give chase; null when nobody follows. */
  pursuit_encounter_id?: string | null;
}

/**
 * The ledger a running turn writes to: its charge and its free lines (the turn's, a summary's), queued while it runs
 * and written once the hold is released (`settleHandedOff`).
 */
export type TurnLedger = JobLedger;

export interface AgentTurnDeps {
  /** Suspended or child accounts. */
  accountRefusal(userId: string): Promise<Refusal | null>;
  loadCampaign(campaignId: string): Promise<CampaignRow | null>;
  /** The owner or a co-DM. */
  isDm(campaign: CampaignRow, userId: string): Promise<boolean>;
  /** By id alone: the handler decides whether it belongs to the caller. */
  loadSession(sessionId: string): Promise<SessionRow | null>;
  /** The time now, in milliseconds: a dependency so a test can let six hours pass. */
  now(): number;
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
    /** The Narrator's voice the host chose before sitting down; null leaves the table on its default. */
    narratorVoice: "male" | "female" | null;
  }): Promise<SessionRow>;
  /**
   * The campaign's open play session, started if there is none: sitting down at the table is the game being played.
   * `opened` says whether this call started it (false: the DM already had one running and the table joined it), which
   * is what decides at the end whether leaving the table may close it. Null when it could not be opened; the
   * conversation then runs without one and what it writes carries no session.
   */
  openPlaySession(campaignId: string): Promise<{ id: string; opened: boolean } | null>;
  /** The stored rows in reach of a turn (`turnsInReach.ts`): never the whole of a table that has run for months. */
  loadTurns(sessionId: string, summaryThroughSeq: number): Promise<StoredTurn[]>;
  rateLimit(userId: string): Promise<boolean>;
  resolveProvider(campaign: CampaignRow): Promise<AgentProvider | null>;
  loadPrice(model: string): Promise<ModelPrice | null>;
  loadCalibration(): Promise<{ usdPerCredit: number | null; margin: number } | null>;
  /** True when the message must not be sent. Fails open (false) when the check cannot run. */
  isFlagged(message: string): Promise<boolean>;
  /**
   * How many of the account's messages the screen refused within the strike window (`conduct.ts`). An account
   * that keeps trying finds the table closed.
   */
  strikes(userId: string): Promise<number>;
  /** True when what a turn wrote must not be kept, shown again, put on record or spoken. Fails open like `isFlagged`. */
  isFlaggedOutput(text: string, childTookPart: boolean): Promise<boolean>;
  /** Whether any of these characters of the campaign is a child by their record (`readsAsChild`). */
  anyChild(campaignId: string, characterIds: string[]): Promise<boolean>;
  /**
   * Takes the hold (`withCreditHold`, reason "agent_turn"; 0 credits holds nothing, own-key play) and runs `work` under
   * it. The work `hand`s the hold off to the stream, which settles it (`settle`). A refused hold answers its refusal
   * without running `work`.
   */
  withHold(userId: string, credits: number, work: (hold: { handOff(): string[] }) => Promise<Response>): Promise<Response>;
  /**
   * The stream's half of the hold (`settleHandedOff`): releases `ids` exactly once when `work` ends, however it ends,
   * then writes the ledger lines it queued. The lines of work that threw are written free.
   */
  settle(userId: string, ids: string[], work: (ledger: TurnLedger) => Promise<void>): Promise<void>;
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
  loadFights(campaignId: string, locationId: string | null, fightEncounterId: string | null, pursuitEncounterId?: string | null): Promise<FightsInView>;
  /** Says which fight is on the party's heels, or (null) that nobody follows. */
  setPursuit(sessionId: string, campaignId: string, encounterId: string | null): Promise<void>;
  /** Starts the fight the narrator asked for and points the conversation at it. Throws when it could not. */
  startFight(
    ctx: { campaignId: string; sessionId: string; userId: string; memberId: string; allies: string[]; locationId: string | null; playSessionId: string | null },
    plan: FightPlan,
  ): Promise<{ encounterId: string; name: string }>;
  /** Lets the conversation go of its fight (null), once its aftermath has been told. */
  setFight(sessionId: string, campaignId: string, encounterId: string | null): Promise<void>;
  /** The campaign's handouts the played character does not hold yet. */
  loadHandouts(campaignId: string, memberId: string): Promise<HandoutOffer[]>;
  /** The campaign's own picture of a record, with the name it is shown under; null when there is none. */
  loadPicture(campaignId: string, what: PictureOf, id: string): Promise<{ title: string; url: string } | null>;
  /** Hands a handout to the played character for real, beside whoever already holds it. Throws when it could not. */
  giveHandout(campaignId: string, handoutId: string, memberId: string): Promise<void>;
  /** The campaign's places and the roads between them, as the caller may read them: what a journey is measured on. */
  loadTravelMap(campaignId: string, gameSystem: string | null): Promise<TravelMap>;
  /** A fair whole number from 1 to `max`, for a roll behind the screen on one of the campaign's tables. */
  rollDie(max: number): number;
  /** Marks a prepared fight as fought, so it is not offered at its place again. */
  finishFight(campaignId: string, encounterId: string): Promise<void>;
  /** Lays a won fight's loot notes where it was fought, once, as things the campaign placed there. */
  layFightLoot(campaignId: string, encounterId: string, placeId: string | null, held: LootHeld): Promise<void>;
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
  /** What has become true of the party's place and its rooms (explored, cleared, looted, doors found or unlocked). Throws on a failed read. */
  loadSiteState(campaignId: string, locationId: string): Promise<SiteState>;
  /** The newest memories of the characters who are here, as the Narrator is shown them. Throws on a failed read. */
  loadSceneMemories(campaignId: string, characterIds: string[]): Promise<SceneMemory[]>;
  /**
   * Applies one quest move through the same database functions the quest screen calls. Called only after the turn
   * was saved, in the order the moves were made; throws on any failure.
   */
  applyQuestMove(ctx: { campaignId: string; agentSessionId: string; today?: DatePoint | null }, move: QuestMove): Promise<void>;
  /**
   * Moves the campaign's date on by whole days (`advance_campaign_date`, as the caller: the campaign's own policy
   * decides who may). Returns the new date and its words by the campaign's calendar (null when the calendar will not
   * word it). Called only after the turn was saved; throws on any failure.
   */
  advanceDate(campaignId: string, days: number): Promise<{ date: DatePoint; text: string | null }>;
  /** Writes a system line into the campaign's chat, as the Calendar page does when the date moves. Throws on failure. */
  announce(campaignId: string, text: string): Promise<void>;
  /**
   * Judges, with TypeSafe's Jev, whether narration told the player anything the characters' lines did not
   * (`narration.ts`). Null when no judging key is available: then every word the narrator writes is shown.
   */
  judgeNarration: NarrationJudge | null;
  /**
   * Signs a spoken line so it can be voiced as soon as it is shown (`lineKey.ts`). Null where voices are not
   * switched on: then no line carries a key and nothing can be voiced.
   */
  voiceKey: ((sessionId: string, line: KeyedLine) => string) | null;
  /** Whether the table itself made this character's record and the DM has not edited it since: only then may the table rewrite it. */
  isTableMadeCharacter(campaignId: string, characterId: string): Promise<boolean>;
  /** A hazard of that name the campaign keeps, else one the library keeps; null when neither does. */
  /** The rest of the party: every party member of the campaign but the played one (`companions.ts`). */
  loadCompanions(campaignId: string, playedId: string | null): Promise<Companion[]>;
  findHazard(campaignId: string, name: string): Promise<KeptHazard | null>;
  /** Writes a hazard the narrator made as a record of the campaign, marked as made by the AI table. */
  makeHazard(ctx: { campaignId: string; userId: string; provider: string; model: string }, hazard: HazardRules): Promise<void>;
  /** Things changing hands: what is carried and stocked, and the changes carried out (`handsIo.ts`). */
  hands: HandsStore;
  /** Sets the played character's hit points on their sheet (`hitPoints.ts`). */
  setHitPoints(campaignId: string, memberId: string, hitPoints: number): Promise<void>;
  /** Takes one of a thing out of a character's belongings, by name; answers whether they had it. */
  useUpBelonging(campaignId: string, characterId: string, thing: string): Promise<boolean>;
  /** Writes the record of a person the narrator made up (`introduce.ts`), or brings a table-made one up to date, and answers who it is. */
  introduceCharacter(
    ctx: { campaignId: string; userId: string; memberId: string | null; locationId: string | null; provider: string; model: string },
    intro: Introduction,
  ): Promise<{ id: string; name: string }>;
  /** The names of the campaign's own peoples (its species), for `peoples.ts`. */
  loadPeoples(campaignId: string): Promise<string[]>;
  /** The names of a planned fight's creatures that have no stat block; a fight with one of them is not started. */
  statlessFighters(campaignId: string, plan: FightPlan): Promise<string[]>;
  /** The campaign's canon as the table reads it and adds to it (#1226): the world block, the last sitting, what lies here, the lookup, what an invention is held against. */
  canon: CanonStore;
  /**
   * The judge the canon check asks (`canonCheck.ts`), or null without a judging key: an invention is then filed
   * unchecked and the skip is logged. Like `judgeNarration`, an enhancement and never a gate.
   */
  judgeCanon: CanonJudge | null;
}

export type CanonJudge = (request: JudgeRequest) => Promise<JudgeResult>;

export const MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That conversation was not found.",
  left: "You left this table. Sit down again to play on.",
  // A code, not a sentence: the page leaves the table on it and says so in its own words (`turnRefusal.ts`).
  sittingEnded: "sitting_ended",
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
  closed: "table_closed",
  withheld: "The Narrator's answer was withheld by the check on what the table may tell. Nothing was charged. Try something else.",
  conflict: "This conversation was continued somewhere else. Reload it and send your message again.",
  providerBusy: "The AI provider is busy right now. Send your message again in a moment.",
  failed: "The AI table ran into a problem. Send your message again.",
  notSaved: "The turn could not be saved. Send your message again.",
} as const;

export type BegunTurn =
  | { kind: "refused"; refusal: Refusal }
  | {
    kind: "ready";
    /** Credits to hold before running: 0 for own-key play. */
    reserve: number;
    /** `reservationIds` are the hold's, handed off to this run, which settles them. */
    run: (send: (event: AgentEvent) => void, signal: AbortSignal | undefined, reservationIds: string[]) => Promise<void>;
  };

