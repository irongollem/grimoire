/**
 * The handler against an in-memory store with the database's own rules: `appendTurns` writes only when the caller's
 * last seq still matches, answers with the whole credits the conversation's running total newly crossed (floor of the
 * new total minus floor of the old), `saveSummary` refuses when the summary it expected is no longer the stored one,
 * and every reservation must be released. The model is scripted. Expected credits are worked
 * out from the price and calibration below: input is free and output costs 10 USD per million tokens, a credit is
 * worth 0.01 USD at margin 1, so 600 output tokens are 0.006 USD, which is 0.6 credits.
 */
import { describe, expect, it, vi } from "vitest";
import {
  beginTurn,
  handleAgentTurn,
  MAX_OUTPUT_TOKENS,
  MAX_STEPS,
  MESSAGES,
  type AgentEvent,
  type AgentTurnDeps,
  type CampaignRow,
  type Refusal,
  type ResolvedProvider,
  type SessionRow,
} from "./handler";
import type { SceneView } from "../_shared/agent/scene";
import type { PlayerCharacter } from "../_shared/agent/playerCharacter";
import type { RecordedFact } from "../_shared/agent/record";
import type { PendingRoll } from "../_shared/agent/playerRoll";
import type { Prologue } from "../_shared/agent/prologue";
import type { FightPlan, FightsInView } from "../_shared/agent/fight";
import { NO_QUESTS, type QuestMove, type QuestsInPlay } from "../_shared/agent/quests";
import { AgentProviderError, type AgentBlock, type CallModel, type ModelRequest, type ModelStep } from "../_shared/agent/types";
import { blocksOf, type StoredTurn, type TurnRow } from "../_shared/agent/transcript";
import type { CreditLogFields } from "../_shared/credits";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe";

const DM = "00000000-0000-4000-8000-0000000000d1";
const OTHER = "00000000-0000-4000-8000-0000000000e2";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const PLAY_SESSION = "00000000-0000-4000-8000-0000000000a7";
const HONEYCOMB = "00000000-0000-4000-8000-0000000000f1";
const BRAM = "00000000-0000-4000-8000-0000000000f2";
const CELLAR = "00000000-0000-4000-8000-0000000000a5";
const ELSEWHERE = "00000000-0000-4000-8000-0000000000a6";
/** Every place the handler asked for, with the campaign it asked in. */
const sceneLoads: Array<{ campaignId: string; locationId: string }> = [];
const sceneMoves: Array<{ campaignId: string; locationId: string }> = [];
/** The places of CAMPAIGN, as the database holds them. A place of another campaign is simply not here. */
function cellarScene(over: Partial<SceneView> = {}): SceneView {
  return {
    id: CELLAR,
    name: "Honey Cellar",
    kind: "cellar",
    description: "SCENE-DESCRIPTION damp stone.",
    within: "Cup Town",
    withinId: null,
    beside: [],
    places: [],
    characters: [{ id: HONEYCOMB, name: "Honeycomb", occupation: "apprentice" }],
    ...over,
  };
}
const factId = (n: number) => `00000000-0000-4000-8000-00000000f${String(n).padStart(3, "0")}`;
const WREN = "00000000-0000-4000-8000-0000000000b1";
const FIGHT = "00000000-0000-4000-8000-0000000000f7";
/** Every player's character the handler asked for, with the campaign it asked in. */
const characterLoads: Array<{ campaignId: string; characterId: string }> = [];
/** Every character the handler asked for, with the campaign it asked in. */
const speakerLoads: Array<{ campaignId: string; characterId: string }> = [];

function step(output: number, over: Partial<ModelStep> = {}): ModelStep {
  return {
    blocks: [{ type: "text", text: "The door creaks. What do you do?" }],
    stop: "end",
    usage: { provider: "openai", model: "m1", inputTokens: 0, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 },
    ...over,
  };
}

function toolStep(output: number, input: Record<string, unknown> = { expression: "1d20", secret: "DM-ONLY" }): ModelStep {
  const blocks: AgentBlock[] = [{ type: "tool_call", id: "c1", name: "roll", input }];
  return step(output, { blocks, stop: "tool_calls" });
}

type Script = Array<ModelStep | Error | ((request: ModelRequest) => ModelStep)>;

interface Harness {
  deps: AgentTurnDeps;
  events: AgentEvent[];
  log: string[];
  requests: ModelRequest[];
  modelCalls: () => number;
  sessions: Map<string, SessionRow>;
  turns: StoredTurn[];
  appends: Array<{ afterSeq: number; rows: TurnRow[]; credits: number }>;
  /** What characters chose to remember, as the handler filed it. */
  memories: Array<{ characterId: string; kind: string; body: string }>;
  memorySessions: Array<string | null>;
  placed: Array<{ campaignId: string; locationId: string; characterIds: string[] }>;
  summaries: Array<{ expectedThroughSeq: number; throughSeq: number; summary: string; credits: number }>;
  /** The running total of credits accrued per conversation, as the database keeps it. */
  totals: Map<string, number>;
  ledger: Array<{ kind: "spend" | "free" | "byok"; cost: number; log: CreditLogFields }>;
  open: Set<string>;
  reserved: number[];
  state: {
    campaign: CampaignRow | null;
    isDm: boolean;
    provider: ResolvedProvider | null;
    price: { inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion: number | null } | null;
    calibration: { usdPerCredit: number | null; margin: number } | null;
    flagged: boolean;
    rateOk: boolean;
    reservation: Refusal | null;
    conflict: boolean;
    saveThrows: boolean;
    summarySaveThrows: boolean;
    account: Refusal | null;
    /** The places of CAMPAIGN by id. */
    places: Map<string, SceneView>;
    /** The party members of CAMPAIGN by id. One of another campaign is simply not here. */
    characters: Map<string, PlayerCharacter>;
    characterThrows: boolean;
    sceneThrows: boolean;
    memoriesThrow: boolean;
    playSessionThrows: boolean;
    /** The DM already had a session running, so the table joins it instead of starting one. */
    playSessionJoined: boolean;
    /** Creatures of a planned fight that have no stat block, by name. */
    statless: string[];
    /** The character the name search finds was made by the table itself. */
    tableMade: boolean;
    /** Writing an invented person's record fails (a plan's limit). */
    introduceThrows: boolean;
    /** The campaign's own peoples. */
    peoples: string[];
    peoplesThrow: boolean;
    moveFails: boolean;
    /** What the campaign's roll tool answers; null answers like every other campaign tool. */
    rollAnswer: { content: string; isError: boolean } | null;
    pendingRollFails: boolean;
    revealFails: boolean;
    fights: FightsInView;
    fightsThrow: boolean;
    startFightFails: boolean;
    /** The campaign's opening, while its story has not begun; null otherwise. */
    prologue: Prologue | null;
    prologueThrows: boolean;
    record: RecordedFact[];
    recordThrows: boolean;
    /** A sentence the filing answers with instead of a fact id. */
    fileError: string | null;
    discardThrows: boolean;
    quests: QuestsInPlay;
    questsThrow: boolean;
    /** Moves that fail to apply, by their position in the order applied. */
    failMoveAt: Set<number>;
  };
  /** Every quest move the handler applied, in order, and the campaign and conversation it applied it for. */
  applied: Array<{ ctx: { campaignId: string; agentSessionId: string }; move: QuestMove }>;
  questLoads: Array<{ campaignId: string; pressureClockId: string | null }>;
  fightLoads: Array<{ campaignId: string; locationId: string | null; fightEncounterId: string | null }>;
  introduced: Array<{ ctx: { campaignId: string; memberId: string | null; locationId: string | null }; intro: { replaces: string | null; name: string; about: string; known: boolean; here: boolean } }>;
  startedFights: Array<{ ctx: { campaignId: string; sessionId: string; userId: string; memberId: string; locationId: string | null; playSessionId: string | null }; plan: FightPlan }>;
  fightSets: Array<{ sessionId: string; campaignId: string; encounterId: string | null }>;
  /** Every time the opening quest was put in play. */
  begun: Array<{ campaignId: string; questId: string; beatId: string }>;
  /** Every reveal the handler asked for, in order. */
  reveals: Array<{ campaignId: string; memberId: string; locationId: string | null; characterIds: string[] }>;
  /** Every write of the roll the player is asked for (null clears it), with the conversation and campaign it was for. */
  pendingRolls: Array<{ sessionId: string; campaignId: string; pending: PendingRoll | null }>;
  /** What the database holds as facts: the ones the narrator filed this run, and what the load answers with. */
  facts: Array<{ id: string; campaignId: string; campaignSessionId: string | null; agentSessionId: string; body: string; hidden: boolean; closes: string | null; about: Array<{ type: string; id: string }> }>;
  recordLoads: Array<{ campaignId: string; locationId: string | null; characterIds: string[] }>;
  discards: Array<{ campaignId: string; ids: string[] }>;
  script: Script;
}

function harness(script: Script = [step(600)], isByok = false): Harness {
  const log: string[] = [];
  const requests: ModelRequest[] = [];
  let calls = 0;
  const callModel: CallModel = async (request) => {
    calls++;
    requests.push(request);
    log.push("model");
    const next = h.script.shift();
    if (!next) throw new Error("script ran out");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(request) : next;
  };
  const h: Harness = {
    events: [],
    log,
    requests,
    modelCalls: () => calls,
    sessions: new Map<string, SessionRow>(),
    turns: [],
    appends: [],
    memories: [],
    memorySessions: [],
    placed: [],
    summaries: [],
    totals: new Map<string, number>(),
    ledger: [],
    open: new Set<string>(),
    reserved: [],
    script,
    state: {
      campaign: { id: CAMPAIGN, user_id: DM, name: "Cup Town", game_system: "dnd5e-2024", ai_enabled: true },
      isDm: true,
      provider: { provider: "openai", model: "m1", isByok, callModel },
      price: { inputPerMillion: 0, outputPerMillion: 10, cachedInputPerMillion: null },
      calibration: { usdPerCredit: 0.01, margin: 1 },
      flagged: false,
      rateOk: true,
      reservation: null,
      conflict: false,
      saveThrows: false,
      summarySaveThrows: false,
      account: null,
      places: new Map<string, SceneView>([[CELLAR, cellarScene()]]),
      characters: new Map<string, PlayerCharacter>(),
      characterThrows: false,
      sceneThrows: false,
      memoriesThrow: false,
      playSessionThrows: false,
      playSessionJoined: false,
      statless: [],
      tableMade: false,
      introduceThrows: false,
      peoples: [],
      peoplesThrow: false,
      moveFails: false,
      rollAnswer: null,
      pendingRollFails: false,
      revealFails: false,
      prologue: null,
      prologueThrows: false,
      fights: { prepared: [], fight: null },
      fightsThrow: false,
      startFightFails: false,
      record: [],
      recordThrows: false,
      fileError: null,
      discardThrows: false,
      quests: NO_QUESTS,
      questsThrow: false,
      failMoveAt: new Set<number>(),
    },
    applied: [],
    questLoads: [],
    pendingRolls: [],
    reveals: [],
    begun: [],
    fightLoads: [],
    introduced: [],
    startedFights: [],
    fightSets: [],
    facts: [],
    recordLoads: [],
    discards: [],
    deps: undefined as unknown as AgentTurnDeps,
  };
  const accrue = (sessionId: string, credits: number): number => {
    const before = h.totals.get(sessionId) ?? 0;
    const after = Math.round((before + credits) * 1_000_000) / 1_000_000;
    h.totals.set(sessionId, after);
    return Math.floor(after) - Math.floor(before);
  };
  h.deps = {
    accountRefusal: async () => h.state.account,
    loadCampaign: async () => h.state.campaign,
    isDm: async () => h.state.isDm,
    // A copy, as a database read is: the handler must not see later writes through its own session object.
    loadSession: async (id) => {
      const row = h.sessions.get(id);
      return row ? { ...row } : null;
    },
    createSession: async ({ userId, campaignId, sceneLocationId, campaignSessionId, openedPlaySession, partyMemberId }) => {
      const row: SessionRow = {
        id: "00000000-0000-4000-8000-0000000000b9",
        user_id: userId,
        campaign_id: campaignId,
        summary: null,
        summary_through_seq: 0,
        scene_location_id: sceneLocationId,
        campaign_session_id: campaignSessionId,
        pressure_clock_id: null,
        party_member_id: partyMemberId,
        opened_play_session: openedPlaySession,
        left_at: null,
        pending_roll: null,
        fight_encounter_id: null,
      };
      h.sessions.set(row.id, row);
      log.push("create");
      return { ...row };
    },
    loadTurns: async (id) => h.turns.filter(() => id !== ""),
    rateLimit: async () => h.state.rateOk,
    resolveProvider: async () => h.state.provider,
    loadPrice: async () => h.state.price,
    loadCalibration: async () => h.state.calibration,
    isFlagged: async () => h.state.flagged,
    reserve: async (_user, credits) => {
      h.reserved.push(credits);
      if (h.state.reservation) return { ok: false, refusal: h.state.reservation };
      const id = `r${h.reserved.length}`;
      h.open.add(id);
      return { ok: true, ids: [id] };
    },
    release: async (ids) => {
      for (const id of ids) h.open.delete(id);
    },
    recordGeneration: async (byok, cost, fields) => {
      log.push("charge");
      h.ledger.push({ kind: byok ? "byok" : "spend", cost, log: fields });
    },
    recordFreeGeneration: async (fields) => {
      log.push("free");
      h.ledger.push({ kind: "free", cost: 0, log: fields });
    },
    appendTurns: async (sessionId, afterSeq, rows, credits) => {
      log.push("save");
      if (h.state.saveThrows) throw new Error("db down");
      const last = h.turns.reduce((max, t) => Math.max(max, t.seq), 0);
      if (h.state.conflict || last !== afterSeq) return "conflict";
      h.appends.push({ afterSeq, rows, credits });
      for (const r of rows) h.turns.push({ seq: r.seq, role: r.role, blocks: r.blocks });
      return { due: accrue(sessionId, credits) };
    },
    saveSummary: async ({ sessionId, expectedThroughSeq, throughSeq, summary, credits }) => {
      log.push("save-summary");
      if (h.state.summarySaveThrows) throw new Error("db down");
      const session = h.sessions.get(sessionId)!;
      if (session.summary_through_seq !== expectedThroughSeq) return "stale";
      h.summaries.push({ expectedThroughSeq, throughSeq, summary, credits });
      session.summary = summary;
      session.summary_through_seq = throughSeq;
      return { due: accrue(sessionId, credits) };
    },
    tools: [{ name: "roll", description: "roll", inputSchema: {} }],
    callTool: async (name) =>
      name === "roll" && h.state.rollAnswer !== null
        ? h.state.rollAnswer
        : { content: "RESULT-SECRET: the duke is the lich", isError: false },
    loadCharacter: async (campaignId, characterId) => {
      characterLoads.push({ campaignId, characterId });
      if (h.state.characterThrows) throw new Error("db down");
      return campaignId === CAMPAIGN ? (h.state.characters.get(characterId) ?? null) : null;
    },
    loadScene: async (campaignId, locationId) => {
      sceneLoads.push({ campaignId, locationId });
      if (h.state.sceneThrows) throw new Error("db down");
      return campaignId === CAMPAIGN ? (h.state.places.get(locationId) ?? null) : null;
    },
    loadFights: async (campaignId, locationId, fightEncounterId) => {
      h.fightLoads.push({ campaignId, locationId, fightEncounterId });
      if (h.state.fightsThrow) throw new Error("db down");
      return h.state.fights;
    },
    startFight: async (ctx, plan) => {
      if (h.state.startFightFails) throw new Error("db down");
      h.startedFights.push({ ctx, plan });
      return { encounterId: FIGHT, name: plan.name };
    },
    setFight: async (sessionId, campaignId, encounterId) => {
      h.fightSets.push({ sessionId, campaignId, encounterId });
    },
    loadPrologue: async (campaignId) => {
      if (h.state.prologueThrows) throw new Error("db down");
      return campaignId === CAMPAIGN ? h.state.prologue : null;
    },
    beginPrologue: async (campaignId, prologue) => {
      log.push("prologue");
      h.begun.push({ campaignId, questId: prologue.questId, beatId: prologue.beatId });
    },
    revealToCharacter: async (input) => {
      if (h.state.revealFails) throw new Error("db down");
      h.reveals.push(input);
    },
    setPendingRoll: async (sessionId, campaignId, pending) => {
      if (h.state.pendingRollFails) throw new Error("db down");
      h.pendingRolls.push({ sessionId, campaignId, pending });
    },
    setScene: async (sessionId, campaignId, locationId) => {
      sceneMoves.push({ campaignId, locationId });
      const scene = campaignId === CAMPAIGN ? (h.state.places.get(locationId) ?? null) : null;
      if (!scene || h.state.moveFails) return null;
      h.sessions.get(sessionId)!.scene_location_id = locationId;
      return scene;
    },
    saveMemories: async (input) => {
      log.push("memories");
      if (h.state.memoriesThrow) throw new Error("db down");
      h.memories.push(...input.memories);
      h.memorySessions.push(input.campaignSessionId);
    },
    loadRecord: async (campaignId, about) => {
      h.recordLoads.push({ campaignId, ...about });
      if (h.state.recordThrows) throw new Error("db down");
      return h.state.record;
    },
    fileFact: async (input) => {
      if (h.state.fileError) return { error: h.state.fileError };
      const id = factId(h.facts.length + 1);
      h.facts.push({
        id,
        campaignId: input.campaignId,
        campaignSessionId: input.campaignSessionId,
        agentSessionId: input.agentSessionId,
        body: input.fact,
        hidden: input.hidden,
        closes: input.closes,
        about: input.about,
      });
      return { id };
    },
    discardFacts: async (campaignId, ids) => {
      h.discards.push({ campaignId, ids });
      log.push("discard");
      if (h.state.discardThrows) throw new Error("db down");
      h.facts = h.facts.filter((f) => !ids.includes(f.id));
    },
    findCharacters: async (_campaignId, name) =>
      "apprentice honeycomb".includes(name.toLowerCase()) ? [{ id: HONEYCOMB, shownName: "Apprentice Honeycomb" }] : [],
    placeCharacters: async (campaignId, locationId, characterIds) => {
      log.push("place");
      h.placed.push({ campaignId, locationId, characterIds });
    },
    loadQuests: async (campaignId, pressureClockId) => {
      h.questLoads.push({ campaignId, pressureClockId });
      if (h.state.questsThrow) throw new Error("db down");
      return h.state.quests;
    },
    applyQuestMove: async (ctx, move) => {
      const at = h.applied.length;
      log.push("quest-move");
      h.applied.push({ ctx, move });
      if (h.state.failMoveAt.has(at)) throw new Error("rpc failed");
    },
    judgeNarration: null,
    voiceKey: null,
    statlessFighters: async () => h.state.statless,
    isTableMadeCharacter: async () => h.state.tableMade,
    introduceCharacter: async (ctx, intro) => {
      if (h.state.introduceThrows) throw new Error("quota");
      h.introduced.push({ ctx, intro });
      return { id: `new-${h.introduced.length}`, name: intro.name };
    },
    loadPeoples: async () => {
      if (h.state.peoplesThrow) throw new Error("db down");
      return h.state.peoples;
    },
    openPlaySession: async () => {
      log.push("open-session");
      if (h.state.playSessionThrows) throw new Error("db down");
      return { id: PLAY_SESSION, opened: h.state.playSessionJoined ? false : true };
    },
    loadSpeaker: async (campaignId, characterId) => {
      speakerLoads.push({ campaignId, characterId });
      if (characterId === BRAM) return { id: BRAM, shownName: "Bram", profile: "Name: Bram", memories: "" };
      return characterId === HONEYCOMB
        ? { id: HONEYCOMB, shownName: "Honeycomb", profile: "Name: Honeycomb\nNotes: HONEYCOMB-SECRET", memories: "" }
        : null;
    },
  };
  return h;
}

/** A stored conversation, with `accrued` credits already on its running total. */
function existingSession(h: Harness, over: Partial<SessionRow> = {}, accrued = 0): SessionRow {
  const row: SessionRow = {
    id: SESSION,
    user_id: DM,
    campaign_id: CAMPAIGN,
    summary: null,
    summary_through_seq: 0,
    scene_location_id: null,
    campaign_session_id: null,
    pressure_clock_id: null,
    party_member_id: null,
    opened_play_session: false,
    left_at: null,
    pending_roll: null,
    fight_encounter_id: null,
    ...over,
  };
  h.sessions.set(row.id, row);
  h.totals.set(row.id, accrued);
  return row;
}

async function play(h: Harness, over: { body?: unknown; userId?: string; signal?: AbortSignal } = {}) {
  const refusal = await handleAgentTurn({
    userId: over.userId ?? DM,
    body: over.body ?? { campaignId: CAMPAIGN, message: "I open the door.", mode: "say" },
    deps: h.deps,
    send: (e) => {
      h.events.push(e);
      if (e.type === "done") h.log.push("done");
    },
    signal: over.signal,
  });
  return refusal;
}

const last = (h: Harness) => h.events[h.events.length - 1];
/** What the model was sent as this turn's opening message: the state of the table, then the player's message. */
function opening(request: ModelRequest): string {
  const first = [...request.messages].reverse().find((m) => m.role === "user" && m.blocks[0]?.type === "text");
  const block = first?.blocks[0];
  return block && block.type === "text" ? block.text : "";
}

describe("who may play", () => {
  it("refuses a player who is a member but not a DM, and calls no model", async () => {
    const h = harness();
    h.state.isDm = false;
    expect(await play(h, { userId: OTHER })).toEqual({ status: 403, error: MESSAGES.forbidden });
    expect(h.modelCalls()).toBe(0);
    expect(h.reserved).toEqual([]);
  });

  it("answers 404, not 403, for another account's conversation, and calls no model", async () => {
    const h = harness();
    existingSession(h, { user_id: OTHER });
    const refusal = await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi", mode: "say" } });
    expect(refusal).toEqual({ status: 404, error: MESSAGES.notFound });
    expect(h.modelCalls()).toBe(0);
    expect(h.reserved).toEqual([]);
  });

  it("answers 404 for the caller's own conversation in another campaign", async () => {
    const h = harness();
    existingSession(h, { campaign_id: OTHER_CAMPAIGN });
    const refusal = await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi", mode: "say" } });
    expect(refusal?.status).toBe(404);
    expect(h.modelCalls()).toBe(0);
  });

  it("answers 404 for a conversation that does not exist", async () => {
    const h = harness();
    const refusal = await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi", mode: "say" } });
    expect(refusal?.status).toBe(404);
  });

  it("refuses a campaign with AI switched off", async () => {
    const h = harness();
    h.state.campaign = { ...h.state.campaign!, ai_enabled: false };
    expect((await play(h))?.status).toBe(403);
    expect(h.modelCalls()).toBe(0);
  });

  it("refuses a campaign that does not exist", async () => {
    const h = harness();
    h.state.campaign = null;
    expect((await play(h))?.status).toBe(404);
  });

  it("passes on a suspended or child account's refusal before reading anything", async () => {
    const h = harness();
    h.state.account = { status: 403, error: "child_account" };
    expect(await play(h)).toEqual({ status: 403, error: "child_account" });
    expect(h.modelCalls()).toBe(0);
  });

  it("answers 429 when the rate limit is spent, before any reservation", async () => {
    const h = harness();
    h.state.rateOk = false;
    expect((await play(h))?.status).toBe(429);
    expect(h.reserved).toEqual([]);
  });
});

describe("the request", () => {
  it.each([
    ["not an object", "hello"],
    ["no campaign", { message: "hi", mode: "say" }],
    ["campaign not a uuid", { campaignId: "x", message: "hi", mode: "say" }],
    ["session not a uuid", { campaignId: CAMPAIGN, sessionId: "x", message: "hi", mode: "say" }],
    ["empty after trimming", { campaignId: CAMPAIGN, message: "   ", mode: "say" }],
    ["too long", { campaignId: CAMPAIGN, message: "a".repeat(4001), mode: "say" }],
    ["message not a string", { campaignId: CAMPAIGN, message: 4, mode: "say" }],
  ])("answers 400 for a body that is %s", async (_name, body) => {
    const h = harness();
    expect((await play(h, { body }))?.status).toBe(400);
    expect(h.modelCalls()).toBe(0);
  });

  it("trims the message and accepts exactly 4000 characters", async () => {
    const h = harness();
    expect(await play(h, { body: { campaignId: CAMPAIGN, message: `  ${"a".repeat(4000)}  `, mode: "do" } })).toBeNull();
    const first = h.requests[0].messages[0].blocks[0];
    expect(first).toMatchObject({ type: "text", player: { kind: "do", text: "a".repeat(4000) } });
  });

  it("refuses a message that does not say whether it is said or done, rather than guessing", async () => {
    const h = harness();
    expect((await play(h, { body: { campaignId: CAMPAIGN, message: "hi" } }))?.status).toBe(400);
    expect((await play(h, { body: { campaignId: CAMPAIGN, message: "hi", mode: "shout" } }))?.status).toBe(400);
    expect(h.modelCalls()).toBe(0);
  });

  it("tells the narrator which button the player pressed, as a hint and not as a ruling on what the words are", async () => {
    const say = harness();
    await play(say, { body: { campaignId: CAMPAIGN, message: "Open up!", mode: "say" } });
    const done = harness();
    await play(done, { body: { campaignId: CAMPAIGN, message: "Open up!", mode: "do" } });
    const read = (h: Harness) => {
      const b = h.requests[0].messages[0].blocks[0];
      return b.type === "text" ? b.text : "";
    };
    // The two must differ, or the narrator cannot tell them apart; neither may claim nothing was said, or a
    // "done" message that is plainly speech could never be answered.
    expect(read(say)).not.toBe(read(done));
    expect(read(say).endsWith("Open up!")).toBe(true);
    expect(read(done)).not.toContain("nothing is said");
  });

  it("stores what the player typed, unchanged, with whether it was said or done, for the page to draw", async () => {
    const h = harness();
    await play(h, { body: { campaignId: CAMPAIGN, message: "Open up!", mode: "say" } });
    expect(h.appends[0].rows[0].blocks[0]).toMatchObject({ player: { kind: "say", text: "Open up!" } });
  });

  it("refuses a flagged message with 400 and costs nothing", async () => {
    const h = harness();
    h.state.flagged = true;
    expect(await play(h)).toEqual({ status: 400, error: MESSAGES.flagged });
    expect(h.modelCalls()).toBe(0);
    expect(h.reserved).toEqual([]);
    expect(h.ledger).toEqual([]);
  });

  it("screens the message before it reserves credits", async () => {
    const h = harness();
    const order: string[] = [];
    const flagged = h.deps.isFlagged;
    const reserve = h.deps.reserve;
    h.deps.isFlagged = async (m) => (order.push("moderate"), flagged(m));
    h.deps.reserve = async (u, c) => (order.push("reserve"), reserve(u, c));
    await play(h);
    expect(order).toEqual(["moderate", "reserve"]);
  });
});

describe("provider and metering", () => {
  it("answers 503 when the provider has no adapter", async () => {
    const h = harness();
    h.state.provider = { ...h.state.provider!, callModel: null };
    expect(await play(h)).toEqual({ status: 503, error: MESSAGES.noAdapter });
    expect(h.reserved).toEqual([]);
  });

  it("answers 503 when no provider is usable", async () => {
    const h = harness();
    h.state.provider = null;
    expect((await play(h))?.status).toBe(503);
  });

  it.each([
    ["no price row", (h: Harness) => (h.state.price = null)],
    ["no calibration at all", (h: Harness) => (h.state.calibration = null)],
    ["a null credit value", (h: Harness) => (h.state.calibration = { usdPerCredit: null, margin: 2 })],
    ["a zero credit value", (h: Harness) => (h.state.calibration = { usdPerCredit: 0, margin: 2 })],
    ["a negative credit value", (h: Harness) => (h.state.calibration = { usdPerCredit: -1, margin: 2 })],
  ])("never runs unmetered: %s is a 503 with no model call and no reservation", async (_name, set) => {
    const h = harness();
    set(h);
    expect(await play(h)).toEqual({ status: 503, error: MESSAGES.noMetering });
    expect(h.modelCalls()).toBe(0);
    expect(h.reserved).toEqual([]);
    expect(h.open.size).toBe(0);
  });

  it("answers 503 when the price lookup itself fails", async () => {
    const h = harness();
    h.deps.loadPrice = async () => {
      throw new Error("db");
    };
    expect((await play(h))?.status).toBe(503);
    expect(h.modelCalls()).toBe(0);
  });

  it("passes on a refused reservation (no credits) as 402 and calls no model", async () => {
    const h = harness();
    h.state.reservation = { status: 402, error: "insufficient_credits" };
    expect(await play(h)).toEqual({ status: 402, error: "insufficient_credits" });
    expect(h.modelCalls()).toBe(0);
    expect(h.sessions.size).toBe(0);
  });
});

describe("credits", () => {
  it("reserves one credit and releases it after a good turn", async () => {
    const h = harness();
    await play(h);
    expect(h.reserved).toEqual([1]);
    expect(h.open.size).toBe(0);
  });

  it("releases the reservation after a provider error", async () => {
    const h = harness([new AgentProviderError("boom", 500, true)]);
    await play(h);
    expect(h.reserved).toEqual([1]);
    expect(h.open.size).toBe(0);
  });

  it("releases the reservation after a save conflict", async () => {
    const h = harness();
    h.state.conflict = true;
    await play(h);
    expect(h.open.size).toBe(0);
  });

  it("releases the reservation when the conversation cannot even be created", async () => {
    const h = harness();
    h.deps.createSession = async () => {
      throw new Error("db");
    };
    await play(h);
    expect(h.open.size).toBe(0);
    expect(last(h)).toEqual({ type: "error", message: MESSAGES.failed });
  });

  it("charges exactly 1 when a turn takes the running total from 0.5 to 1.1", async () => {
    const h = harness([step(600)]);
    existingSession(h, {}, 0.5);
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "say" } });
    expect(h.ledger).toHaveLength(1);
    expect(h.ledger[0]).toMatchObject({ kind: "spend", cost: 1 });
    expect(last(h)).toMatchObject({ type: "done", credits: 1 });
    expect(h.appends[0].credits).toBeCloseTo(0.6, 9);
  });

  it("charges 0 for a turn that accrues 0.2 from 0, and still logs its tokens in a ledger row", async () => {
    const h = harness([step(200)]);
    await play(h);
    expect(h.ledger).toEqual([{ kind: "free", cost: 0, log: expect.objectContaining({ output_tokens: 200, model: "m1" }) }]);
    expect(last(h)).toMatchObject({ type: "done", credits: 0, tokens: 200 });
    expect(h.appends[0].credits).toBeCloseTo(0.2, 9);
  });

  it("logs input as all input: full rate, cache read and cache write", async () => {
    const h = harness([
      step(100, { usage: { provider: "openai", model: "m1", inputTokens: 10, outputTokens: 100, cacheReadTokens: 20, cacheWriteTokens: 5 } }),
    ]);
    await play(h);
    expect(h.ledger[0].log.input_tokens).toBe(35);
  });

  it("BYOK reserves nothing, accrues nothing and writes one zero BYOK row, with no price on file", async () => {
    const h = harness([step(600)], true);
    h.state.price = null;
    h.state.calibration = null;
    await play(h);
    expect(h.reserved).toEqual([]);
    expect(h.appends[0].credits).toBe(0);
    expect(h.ledger).toEqual([{ kind: "byok", cost: 0, log: expect.objectContaining({ output_tokens: 600 }) }]);
    expect(last(h)).toMatchObject({ type: "done", credits: 0 });
  });
});

describe("saving", () => {
  it("saves the new messages after the last seq it loaded", async () => {
    const h = harness([step(100)]);
    existingSession(h);
    h.turns.push(
      { seq: 1, role: "user", blocks: [{ type: "text", text: "before" }] },
      { seq: 2, role: "assistant", blocks: [{ type: "text", text: "earlier answer" }] },
    );
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "say" } });
    expect(h.appends[0].afterSeq).toBe(2);
    expect(h.appends[0].rows.map((r) => r.seq)).toEqual([3, 4]);
    // the model saw the stored history before the new message
    expect(h.requests[0].messages).toHaveLength(3);
  });

  it("answers a save conflict with the reload sentence, charges nothing, and logs the tokens at zero", async () => {
    const h = harness([step(600)]);
    existingSession(h, {}, 0.5);
    h.state.conflict = true;
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "say" } });
    expect(last(h)).toEqual({ type: "error", message: MESSAGES.conflict });
    expect(MESSAGES.conflict).toBe(
      "This conversation was continued somewhere else. Reload it and send your message again.",
    );
    expect(h.ledger).toEqual([{ kind: "free", cost: 0, log: expect.objectContaining({ output_tokens: 600 }) }]);
    expect(h.ledger.some((l) => l.kind === "spend")).toBe(false);
  });

  it("charges nothing when the save fails for another reason", async () => {
    const h = harness([step(600)]);
    existingSession(h, {}, 0.5);
    h.state.saveThrows = true;
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "say" } });
    expect(last(h)).toEqual({ type: "error", message: MESSAGES.notSaved });
    expect(h.ledger.some((l) => l.kind === "spend")).toBe(false);
  });

  it("saves first and charges after", async () => {
    const h = harness([step(600)]);
    existingSession(h, {}, 0.5);
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "say" } });
    expect(h.log.indexOf("save")).toBeGreaterThan(-1);
    expect(h.log.indexOf("charge")).toBeGreaterThan(h.log.indexOf("save"));
  });
});

describe("failures mid-turn", () => {
  it.each([
    ["a retryable provider error", new AgentProviderError("model gpt-x key org-acme quota exceeded", 429, true), MESSAGES.providerBusy],
    ["a provider error that is not retryable", new AgentProviderError("model gpt-x key org-acme invalid", 401, false), MESSAGES.failed],
    ["any other throw", new Error("model gpt-x key org-acme exploded"), MESSAGES.failed],
  ])("turns %s into a plain sentence, saves nothing and charges nothing", async (_name, error, message) => {
    const h = harness([error]);
    await play(h);
    expect(last(h)).toEqual({ type: "error", message });
    expect(h.appends).toEqual([]);
    expect(h.turns).toEqual([]);
    expect(h.ledger).toEqual([]);
    const wire = JSON.stringify(h.events);
    expect(wire).not.toContain("org-acme");
    expect(wire).not.toContain("gpt-x");
  });

  it("does not store the player's message when the turn failed", async () => {
    const h = harness([new Error("x")]);
    await play(h);
    expect(h.turns).toEqual([]);
  });

  it("charges nothing for a failure on a later model call, even though an earlier call used tokens", async () => {
    const h = harness([toolStep(500), new AgentProviderError("down", 500, true)]);
    await play(h);
    expect(h.ledger).toEqual([]);
    expect(h.appends).toEqual([]);
  });
});

describe("what the browser hears", () => {
  it("opens with the session, streams text, and ends with exactly one done", async () => {
    const h = harness([step(100, { blocks: [{ type: "text", text: "Hello" }] })]);
    h.script[0] = (request) => {
      request.onText?.("Hel");
      request.onText?.("lo");
      return step(100, { blocks: [{ type: "text", text: "Hello" }] });
    };
    await play(h);
    expect(h.events[0]).toMatchObject({ type: "session" });
    expect(h.events.filter((e) => e.type === "text")).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
    ]);
    expect(h.events.filter((e) => e.type === "done" || e.type === "error")).toHaveLength(1);
    expect(last(h)).toMatchObject({ type: "done", end: "done", tokens: 100 });
  });

  it("creates a new conversation before the model is called and reports its id first", async () => {
    const h = harness();
    await play(h);
    expect(h.log.indexOf("create")).toBeLessThan(h.log.indexOf("model"));
    expect(h.events[0]).toEqual({ type: "session", sessionId: "00000000-0000-4000-8000-0000000000b9" });
  });

  it("reports an existing conversation's own id and does not create another", async () => {
    const h = harness();
    existingSession(h);
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "say" } });
    expect(h.events[0]).toEqual({ type: "session", sessionId: SESSION });
    expect(h.log).not.toContain("create");
  });

  it("never sends a tool's input or result to the browser", async () => {
    const h = harness([toolStep(50), step(50)]);
    await play(h);
    expect(h.events).toContainEqual({ type: "tool_start", name: "roll" });
    expect(h.events).toContainEqual({ type: "tool_end", name: "roll", isError: false });
    const wire = JSON.stringify(h.events);
    expect(wire).not.toContain("DM-ONLY");
    expect(wire).not.toContain("RESULT-SECRET");
    expect(wire).not.toContain("1d20");
  });

  it("still finishes the turn when the stream's writer throws", async () => {
    const h = harness();
    const refusal = await handleAgentTurn({
      userId: DM,
      body: { campaignId: CAMPAIGN, message: "go", mode: "say" },
      deps: h.deps,
      send: () => {
        throw new Error("stream closed");
      },
    });
    expect(refusal).toBeNull();
    expect(h.appends).toHaveLength(1);
  });
});

describe("limits and abort", () => {
  it("passes the output cap to the model", async () => {
    const h = harness();
    await play(h);
    expect(h.requests[0].maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
    expect(MAX_OUTPUT_TOKENS).toBe(2000);
  });

  it("stops a model that keeps asking for tools at the step limit, saves and charges", async () => {
    const h = harness(Array.from({ length: 20 }, () => toolStep(10)));
    await play(h);
    expect(h.modelCalls()).toBe(MAX_STEPS);
    expect(last(h)).toMatchObject({ type: "done", end: "step_limit" });
    expect(h.appends).toHaveLength(1);
  });

  it("stops at the token budget", async () => {
    const h = harness([toolStep(30_000), toolStep(30_000), toolStep(30_000)]);
    await play(h);
    expect(h.modelCalls()).toBe(2);
    expect(last(h)).toMatchObject({ type: "done", end: "budget", tokens: 60_000 });
  });

  it("saves and charges what an aborted turn used", async () => {
    const controller = new AbortController();
    const h = harness([
      () => {
        controller.abort();
        return toolStep(600);
      },
    ]);
    existingSession(h, {}, 0.5);
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "say" }, signal: controller.signal });
    expect(last(h)).toMatchObject({ type: "done", end: "aborted", credits: 1 });
    expect(h.appends).toHaveLength(1);
    expect(h.ledger[0]).toMatchObject({ kind: "spend", cost: 1 });
    expect(h.open.size).toBe(0);
    // the saved conversation has no call without its answer
    const blocks = h.appends[0].rows.flatMap((r) => r.blocks);
    const callIds = blocks.filter((b) => b.type === "tool_call").map((b) => (b as { id: string }).id);
    const answered = blocks.filter((b) => b.type === "tool_result").map((b) => (b as { callId: string }).callId);
    expect(answered).toEqual(callIds);
  });

  it("saves and charges nothing when aborted before the first model call", async () => {
    const controller = new AbortController();
    controller.abort();
    const h = harness();
    await play(h, { signal: controller.signal });
    expect(h.modelCalls()).toBe(0);
    expect(h.appends).toEqual([]);
    expect(h.ledger).toEqual([]);
    expect(last(h)).toMatchObject({ type: "done", end: "aborted", credits: 0, tokens: 0 });
    expect(h.open.size).toBe(0);
  });
});

describe("the system text", () => {
  it("names the campaign, its ruleset and its id in a trailing section, after an identical standing part", async () => {
    const a = harness();
    await play(a);
    const b = harness();
    b.state.campaign = { ...b.state.campaign!, name: "Ashen Vale", game_system: "dnd5e-2014" };
    await play(b);
    const sa = a.requests[0].system;
    const sb = b.requests[0].system;
    expect(sa).toContain("Cup Town");
    expect(sa).toContain("2024");
    expect(sa).toContain(CAMPAIGN);
    expect(sb).toContain("Ashen Vale");
    const marker = "## This table";
    expect(sa.slice(0, sa.indexOf(marker))).toBe(sb.slice(0, sb.indexOf(marker)));
    expect(sa.slice(0, sa.indexOf(marker))).not.toContain("Cup Town");
  });

  it("adds the conversation's summary after the standing text", async () => {
    const h = harness();
    existingSession(h, { summary: "The party fled the mine." });
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "say" } });
    expect(h.requests[0].system).toContain("## The story so far\n\nThe party fled the mine.");
  });
});

describe("the rolling summary", () => {
  const GO = { campaignId: CAMPAIGN, sessionId: SESSION, message: "I open the door.", mode: "say" };
  const SUMMARY = "The party is at the mine door.";
  const summaryStep = (output = 100, over: Partial<ModelStep> = {}) =>
    step(output, { blocks: [{ type: "text", text: SUMMARY }], ...over });

  /** Six stored turns of two rows, each row 1,000 tokens (12,000 in all). The turn that follows adds 12 more tokens. */
  function longConversation(h: Harness, over: Partial<SessionRow> = {}, accrued = 0, rowCount = 12) {
    existingSession(h, over, accrued);
    for (let seq = 1; seq <= rowCount; seq++) {
      h.turns.push({
        seq,
        role: seq % 2 === 1 ? "user" : "assistant",
        blocks: [{ type: "text", text: `MARK${seq} `.padEnd(4000, "a") }],
      });
    }
  }
  // After the new turn (user "I open the door.", 4 tokens; answer 8) the total is 12,012 tokens. Walking back, the new
  // turn is 12, plus the stored turn at seq 11-12 makes 2,012, plus seq 9-10 makes 4,012 > 4,000. So seq 1-10 fold.

  it("makes no summary call for a short conversation", async () => {
    const h = harness([step(100)]);
    existingSession(h);
    await play(h, { body: GO });
    expect(h.modelCalls()).toBe(1);
    expect(h.summaries).toEqual([]);
  });

  it("tells the player the turn is done before it makes the summary call", async () => {
    const h = harness([step(100), summaryStep()]);
    longConversation(h);
    await play(h, { body: GO });
    expect(h.modelCalls()).toBe(2);
    expect(h.log.indexOf("done")).toBeGreaterThan(-1);
    expect(h.log.indexOf("done")).toBeLessThan(h.log.lastIndexOf("model"));
  });

  it("folds seq 1 to 10, asks with no tools, and stores the summary with the seq it covers", async () => {
    const h = harness([step(100), summaryStep()]);
    longConversation(h);
    await play(h, { body: GO });
    expect(h.requests[0].tools.length).toBeGreaterThan(0);
    expect(h.requests[1].tools).toEqual([]);
    expect(h.summaries).toEqual([{ expectedThroughSeq: 0, throughSeq: 10, summary: SUMMARY, credits: expect.closeTo(0.1, 9) }]);
    const material = h.requests[1].messages[0].blocks[0];
    expect(material).toMatchObject({ type: "text" });
    expect((material as { text: string }).text).toContain("MARK1 ");
    expect((material as { text: string }).text).not.toContain("MARK11 ");
  });

  it("expects the stored summary's seq, and folds only what follows it", async () => {
    // 14 stored rows with the first 2 already summarised: seq 3-14 is 12,000 tokens, plus the new turn's 12.
    // Walking back, the new turn is 12, seq 13-14 makes 2,012, seq 11-12 makes 4,012 > 4,000: seq 3-12 fold.
    const h = harness([step(100), summaryStep()]);
    longConversation(h, { summary: "OLD-RECORD", summary_through_seq: 2 }, 0, 14);
    await play(h, { body: GO });
    expect(h.summaries).toMatchObject([{ expectedThroughSeq: 2, throughSeq: 12 }]);
    const material = (h.requests[1].messages[0].blocks[0] as { text: string }).text;
    expect(material).not.toContain("MARK2 ");
    expect(material).toContain("MARK3 ");
  });

  it("gives the previous summary to the summariser", async () => {
    const h = harness([step(100), summaryStep()]);
    longConversation(h, { summary: "OLD-RECORD", summary_through_seq: 0 });
    await play(h, { body: GO });
    expect((h.requests[1].messages[0].blocks[0] as { text: string }).text).toContain("## The record so far\n\nOLD-RECORD");
  });

  it("sends the next turn the summary and not the folded messages", async () => {
    const h = harness([step(100), summaryStep(), step(100)]);
    longConversation(h);
    await play(h, { body: GO });
    await play(h, { body: { ...GO, message: "I step inside." } });
    const request = h.requests[2];
    expect(request.system).toContain(`## The story so far\n\n${SUMMARY}`);
    const sent = JSON.stringify(request.messages);
    expect(sent).not.toContain("MARK1 ");
    expect(sent).not.toContain("MARK10 ");
    expect(sent).toContain("MARK11 ");
    expect(h.turns).toHaveLength(16); // nothing was deleted
  });

  it("leaves the player with done and no error when the summary call throws, with the turn saved and the reservation released", async () => {
    const h = harness([step(100), new AgentProviderError("down", 500, true)]);
    longConversation(h);
    await play(h, { body: GO });
    expect(h.events.some((e) => e.type === "error")).toBe(false);
    expect(last(h)).toMatchObject({ type: "done" });
    expect(h.appends).toHaveLength(1);
    expect(h.summaries).toEqual([]);
    expect(h.open.size).toBe(0);
  });

  it("does not turn a failed summary save into an error for the player, and still logs the tokens the call spent", async () => {
    // The provider was paid for the summary whether or not the database kept it: a call missing from the ledger is
    // a cost nobody can see.
    const h = harness([step(100), summaryStep(70)]);
    h.state.summarySaveThrows = true;
    longConversation(h);
    await play(h, { body: GO });
    expect(last(h)).toMatchObject({ type: "done" });
    expect(h.open.size).toBe(0);
    expect(h.ledger.map((l) => l.kind)).toEqual(["free", "free"]);
    expect(h.ledger[1].log.output_tokens).toBe(70);
  });

  it("stores nothing and bills nothing for an empty summary, but still logs its tokens", async () => {
    const h = harness([step(100), step(50, { blocks: [{ type: "text", text: "  " }] })]);
    longConversation(h);
    await play(h, { body: GO });
    expect(h.summaries).toEqual([]);
    expect(h.log).not.toContain("save-summary");
    expect(h.ledger.map((l) => l.kind)).toEqual(["free", "free"]);
    expect(h.ledger[1].log.output_tokens).toBe(50);
  });

  it("bills nothing when another summary got there first, even one that would cross a credit", async () => {
    // 2,000 output tokens are 2.0 credits: a stale save that billed them would show as a spend row
    const h = harness([
      step(100),
      () => {
        h.sessions.get(SESSION)!.summary_through_seq = 3; // another summary lands while this one is being written
        return summaryStep(2000);
      },
    ]);
    longConversation(h);
    await play(h, { body: GO });
    expect(h.summaries).toEqual([]);
    expect(h.ledger.some((l) => l.kind === "spend")).toBe(false);
    expect(h.ledger).toHaveLength(2);
    expect(h.ledger[1].log.output_tokens).toBe(2000);
  });

  it("spends the whole credit a summary takes the total across, and the turn's done reports only the turn's own", async () => {
    // total 0.7; the turn adds 0.2 (0.9, nothing due); the summary adds 0.2 (1.1, one credit due)
    const h = harness([step(200), summaryStep(200)]);
    longConversation(h, {}, 0.7);
    await play(h, { body: GO });
    expect(last(h)).toMatchObject({ type: "done", credits: 0 });
    expect(h.ledger).toEqual([
      { kind: "free", cost: 0, log: expect.objectContaining({ output_tokens: 200 }) },
      { kind: "spend", cost: 1, log: expect.objectContaining({ output_tokens: 200 }) },
    ]);
  });

  it("starts no summary after an aborted turn", async () => {
    const controller = new AbortController();
    const h = harness([
      () => {
        controller.abort();
        return toolStep(100);
      },
      summaryStep(),
    ]);
    longConversation(h);
    await play(h, { body: GO, signal: controller.signal });
    expect(last(h)).toMatchObject({ type: "done", end: "aborted" });
    expect(h.modelCalls()).toBe(1);
  });

  it("starts no summary when the turn's save conflicted", async () => {
    const h = harness([step(100), summaryStep()]);
    h.state.conflict = true;
    longConversation(h);
    await play(h, { body: GO });
    expect(h.modelCalls()).toBe(1);
    expect(h.summaries).toEqual([]);
  });

  it("summarises own-key play without spending: no credits accrued, zero rows only", async () => {
    const h = harness([step(100), summaryStep(2000)], true);
    h.state.price = null;
    h.state.calibration = null;
    longConversation(h);
    await play(h, { body: GO });
    expect(h.summaries).toHaveLength(1);
    expect(h.summaries[0].credits).toBe(0);
    expect(h.ledger.map((l) => l.kind)).toEqual(["byok", "byok"]);
    expect(h.ledger.every((l) => l.cost === 0)).toBe(true);
  });
});

describe("beginTurn", () => {
  it("returns a refusal as a value and has streamed nothing", async () => {
    const h = harness();
    h.state.isDm = false;
    const begun = await beginTurn({ userId: OTHER, body: { campaignId: CAMPAIGN, message: "hi", mode: "say" }, deps: h.deps });
    expect(begun).toEqual({ kind: "refused", refusal: { status: 403, error: MESSAGES.forbidden } });
    expect(h.events).toEqual([]);
  });
});

describe("a character speaks for itself", () => {
  // The narrator asks Honeycomb to speak (100 output tokens), her own call answers (300), the narrator ends (200).
  // 600 output tokens are 0.6 credits; without the speech call it would be 0.3.
  const speakCall = (input: Record<string, unknown>): ModelStep =>
    step(100, { blocks: [{ type: "tool_call", id: "s1", name: "speak", input }], stop: "tool_calls" });
  const script = (): Script => [
    speakCall({ speaker_id: HONEYCOMB, happening: "A stranger asks who you are.", campaign_id: OTHER_CAMPAIGN }),
    step(300, { blocks: [{ type: "text", text: "Honeycomb. Apprentice, once." }] }),
    step(200),
  ];

  it("bills the tokens a character's own call used, not only the narrator's", async () => {
    const h = harness(script());
    await play(h);
    expect(h.appends[0].credits).toBeCloseTo(0.6, 6);
    const stored = h.appends[0].rows.reduce((n, r) => n + (r.output_tokens === null ? 0 : r.output_tokens), 0);
    expect(stored).toBe(600);
    expect(h.ledger[0].log.output_tokens).toBe(600);
    expect(last(h)).toMatchObject({ type: "done", tokens: 600 });
  });

  // Bug caught live (17 Nov 2026): "Master Floret" was invented in a memory and lived only as three sentences on
  // record. No person existed for the next sitting to find, for the People page, or to give a voice.
  describe("a person the narrator made up", () => {
    const introduce = (input: Record<string, unknown>): ModelStep =>
      step(10, { blocks: [{ type: "tool_call", id: "i1", name: "introduce", input }], stop: "tool_calls" });
    const floret = { name: "Master Floret", about: "Bought Rosie as a child on the Old Buy-Floor." };

    it("gets a record once the turn is kept, and the page is told who", async () => {
      const h = harness([introduce(floret), step(10)]);
      await play(h);
      expect(h.introduced.map((i) => i.intro.name)).toEqual(["Master Floret"]);
      expect(h.events.filter((e) => e.type === "introduced")).toEqual([{ type: "introduced", person: { id: "new-1", name: "Master Floret" } }]);
    });

    // Bug caught: a record written for a turn the player never got to keep, so a retry makes the person twice.
    it("gets no record when the turn is not kept", async () => {
      const h = harness([introduce(floret), step(10)]);
      h.state.saveThrows = true;
      await play(h);
      expect(h.introduced).toEqual([]);
    });

    // Bug caught: someone the narrator keeps hidden announced to the player as a person they now know.
    it("is not announced when the player's character does not know of them", async () => {
      const h = harness([introduce({ ...floret, known: false }), step(10)]);
      await play(h);
      expect(h.introduced).toHaveLength(1);
      expect(h.events.some((e) => e.type === "introduced")).toBe(false);
    });

    // Bug caught: the DM's own character rewritten by the table because the narrator "introduced" them again.
    it("never rewrites a record the table did not make", async () => {
      const h = harness([introduce({ name: "Apprentice Honeycomb", about: "Secretly a dragon." }), step(10)]);
      await play(h);
      expect(h.introduced).toEqual([]);
      expect(JSON.stringify(h.requests[1])).toContain("already has a record");
    });

    // Bug caught: the player's account of their old master accepted in the story and lost from his record.
    it("brings its own earlier record up to date, without announcing the person again", async () => {
      const h = harness([introduce({ name: "Apprentice Honeycomb", about: "A bisque warrior who trained Rosie." }), step(10)]);
      h.state.tableMade = true;
      await play(h);
      expect(h.introduced).toEqual([expect.objectContaining({ intro: expect.objectContaining({ replaces: HONEYCOMB, about: "A bisque warrior who trained Rosie." }) })]);
      expect(h.events.some((e) => e.type === "introduced")).toBe(false);
    });

    // Bug caught: a plan's limit on characters failing the whole turn the player just paid for.
    it("costs the record, never the turn, when it cannot be written", async () => {
      const h = harness([introduce(floret), step(10)]);
      h.state.introduceThrows = true;
      await play(h);
      expect(last(h)).toMatchObject({ type: "done" });
      expect(h.events.some((e) => e.type === "introduced")).toBe(false);
    });
  });

  // Bug caught live (17 Nov 2026): the player spoke of "this marrow" whose name they did not know, and the character
  // answered about someone called Marrow, because nothing in its call said a marrow is one of the world's peoples.
  it("tells the narrator and the character who speaks the names of the world's peoples", async () => {
    const h = harness(script());
    h.state.peoples = ["Marrow", "Sugarspun"];
    await play(h);
    const told = h.requests.filter((r) => r.system.includes("The peoples of this world: Marrow, Sugarspun"));
    // The narrator's calls and the character's own call (the one made with no tools).
    expect(told.some((r) => r.tools.length > 0)).toBe(true);
    expect(told.some((r) => r.tools.length === 0)).toBe(true);
  });

  it("plays the turn without that knowledge when the peoples cannot be read", async () => {
    const h = harness(script());
    h.state.peoplesThrow = true;
    await play(h);
    expect(last(h)).toMatchObject({ type: "done" });
    expect(h.events.some((e) => e.type === "line")).toBe(true);
  });

  it("gives a key to what a character said and none to what it did, so only speech can be voiced", async () => {
    const h = harness([
      script()[0],
      step(300, { blocks: [{ type: "text", text: "DOES: Wipes her hands.\nSAYS: Honeycomb. Apprentice, once." }] }),
      step(200),
    ]);
    h.deps.voiceKey = (sessionId, line) => `${sessionId}:${line.text}`;
    await play(h);
    // The key is made for the conversation the turn is in, which is what makes it useless in anyone else's.
    const sitting = h.events.flatMap((e) => (e.type === "session" ? [e.sessionId] : []))[0];
    const keys = h.events.flatMap((e) => (e.type === "line" ? [[e.line.kind, e.voice]] : []));
    expect(keys).toEqual([
      ["acted", undefined],
      ["spoken", `${sitting}:Honeycomb. Apprentice, once.`],
    ]);
  });

  it("gives no line a key where voices are not switched on", async () => {
    const h = harness(script());
    await play(h);
    expect(h.events.some((e) => e.type === "line")).toBe(true);
    expect(h.events.some((e) => e.type === "line" && e.voice !== undefined)).toBe(false);
  });

  it("sends the browser the deed line before the spoken line, and still nothing of what the narrator put into the tool", async () => {
    const h = harness([
      script()[0],
      step(300, { blocks: [{ type: "text", text: "DOES: Wipes her hands.\nSAYS: Honeycomb. Apprentice, once." }] }),
      step(200),
    ]);
    await play(h);
    const lines = h.events.flatMap((e) => (e.type === "line" ? [e.line] : []));
    expect(lines).toEqual([
      { kind: "acted", speaker: { id: HONEYCOMB, name: "Honeycomb" }, text: "Wipes her hands." },
      { kind: "spoken", speaker: { id: HONEYCOMB, name: "Honeycomb" }, text: "Honeycomb. Apprentice, once." },
    ]);
    const sent = JSON.stringify(h.events);
    expect(sent).not.toContain("A stranger asks who you are.");
    expect(sent).not.toContain("HONEYCOMB-SECRET");
  });

  it("sends the browser who a line was said to, and nothing a listener held back, though it is stored for a later turn", async () => {
    const h = harness([
      speakCall({ speaker_id: HONEYCOMB, happening: "h", present: [BRAM] }),
      step(300, { blocks: [{ type: "text", text: "SAYS: Hello, everyone.\nTO: everyone" }] }),
      step(300, { blocks: [{ type: "text", text: "SAYS: HELD-BACK-SENTENCE\nWANT: 3" }] }),
      step(200),
    ]);
    await play(h);
    const lines = h.events.flatMap((e) => (e.type === "line" ? [e.line] : []));
    expect(lines).toEqual([{ kind: "spoken", speaker: { id: HONEYCOMB, name: "Honeycomb" }, text: "Hello, everyone.", to: "everyone" }]);
    expect(JSON.stringify(h.events)).not.toContain("HELD-BACK-SENTENCE");
    const result = h.appends[0].rows.flatMap((r) => r.blocks).find((b) => b.type === "tool_result");
    expect(result).toMatchObject({ withheld: [{ speaker: { id: BRAM, name: "Bram" }, text: "HELD-BACK-SENTENCE", to: null }] });
  });

  it("looks a speaker up in the conversation's own campaign, whatever campaign the model names", async () => {
    speakerLoads.length = 0;
    const h = harness(script());
    await play(h);
    expect(speakerLoads).toEqual([{ campaignId: CAMPAIGN, characterId: HONEYCOMB }]);
  });

  it("gives the character's call its own record and none of the narrator's conversation", async () => {
    const h = harness(script());
    await play(h, { body: { campaignId: CAMPAIGN, message: "NARRATOR-ONLY: I open the door.", mode: "say" } });
    const speech = h.requests[1];
    expect(speech.system).toContain("HONEYCOMB-SECRET");
    expect(speech.tools).toEqual([]);
    expect(JSON.stringify(speech)).not.toContain("NARRATOR-ONLY");
  });
});

describe("where the party is", () => {
  const GO = { campaignId: CAMPAIGN, sessionId: SESSION, message: "I look around.", mode: "say" };
  const goTo = (input: Record<string, unknown>): ModelStep =>
    step(10, { blocks: [{ type: "tool_call", id: "g1", name: "go_to", input }], stop: "tool_calls" });

  it("keeps the scene out of the instructions and puts it ahead of the player's words, or a moved party costs the whole prompt cache", async () => {
    const h = harness();
    existingSession(h, { scene_location_id: CELLAR, summary: "SUMMARY-MARK the party fled." });
    await play(h, { body: GO });
    const system = h.requests[0].system;
    expect(system).toContain("Cup Town");
    expect(system).toContain("SUMMARY-MARK");
    expect(system).not.toContain("SCENE-DESCRIPTION");
    const sent = opening(h.requests[0]);
    expect(sent.indexOf("SCENE-DESCRIPTION")).toBeGreaterThan(-1);
    expect(sent.indexOf("I look around.")).toBeGreaterThan(sent.indexOf("SCENE-DESCRIPTION"));
    expect(sent).toContain(`id ${HONEYCOMB}`);
  });

  it("tells the narrator the party has no place yet, and still runs the turn", async () => {
    const h = harness();
    existingSession(h);
    sceneLoads.length = 0;
    await play(h, { body: GO });
    expect(opening(h.requests[0])).toContain("The party has no place yet");
    expect(sceneLoads).toEqual([]);
    expect(last(h)).toMatchObject({ type: "done" });
  });

  it("runs the turn without a scene when the scene fails to load", async () => {
    const h = harness();
    existingSession(h, { scene_location_id: CELLAR });
    h.state.sceneThrows = true;
    await play(h, { body: GO });
    expect(opening(h.requests[0])).toContain("The party has no place yet");
    expect(last(h)).toMatchObject({ type: "done" });
    expect(h.events.some((e) => e.type === "error")).toBe(false);
  });

  it("offers go_to to the narrator", async () => {
    const h = harness();
    existingSession(h);
    await play(h, { body: GO });
    expect(h.requests[0].tools.map((t) => t.name)).toContain("go_to");
  });

  it("moves the party in the conversation's campaign, whatever campaign the model names", async () => {
    const h = harness([goTo({ location_id: CELLAR, campaign_id: OTHER_CAMPAIGN }), step(10)]);
    existingSession(h);
    sceneMoves.length = 0;
    await play(h, { body: GO });
    expect(sceneMoves).toEqual([{ campaignId: CAMPAIGN, locationId: CELLAR }]);
  });

  it("answers an error, sends no scene event and stores nothing for a place outside the campaign", async () => {
    const h = harness([goTo({ location_id: ELSEWHERE }), step(10)]);
    existingSession(h);
    await play(h, { body: GO });
    const result = h.turns.flatMap((t) => t.blocks as AgentBlock[]).find((b) => b.type === "tool_result");
    expect(result).toMatchObject({ isError: true });
    expect(h.events.some((e) => e.type === "scene")).toBe(false);
    expect(h.sessions.get(SESSION)!.scene_location_id).toBeNull();
  });

  it("answers an error for an id that is not a uuid, without touching the store", async () => {
    const h = harness([goTo({ location_id: "the cellar" }), step(10)]);
    existingSession(h);
    await play(h, { body: GO });
    expect(h.turns.flatMap((t) => t.blocks as AgentBlock[]).find((b) => b.type === "tool_result")).toMatchObject({ isError: true });
    expect(h.sessions.get(SESSION)!.scene_location_id).toBeNull();
  });

  it("answers an error when the move could not be stored", async () => {
    const h = harness([goTo({ location_id: CELLAR }), step(10)]);
    existingSession(h);
    h.state.moveFails = true;
    await play(h, { body: GO });
    expect(h.events.some((e) => e.type === "scene")).toBe(false);
  });

  it("moves the party, answers with the new place and sends the scene event with id and name only", async () => {
    const h = harness([goTo({ location_id: CELLAR }), step(10)]);
    existingSession(h);
    h.state.places.set(CELLAR, cellarScene({ description: "TOP-SECRET-NOTE under the stairs." }));
    await play(h, { body: GO });
    expect(h.sessions.get(SESSION)!.scene_location_id).toBe(CELLAR);
    expect(h.events.filter((e) => e.type === "scene")).toEqual([{ type: "scene", scene: { id: CELLAR, name: "Honey Cellar" } }]);
    expect(JSON.stringify(h.events)).not.toContain("TOP-SECRET-NOTE");
    expect(JSON.stringify(h.events)).not.toContain("Honeycomb");
    // The model does get it, in the same turn.
    expect(JSON.stringify(h.requests[1].messages)).toContain("TOP-SECRET-NOTE");
  });

  it("keeps a move that was made even when the turn fails to save afterwards", async () => {
    const h = harness([goTo({ location_id: CELLAR }), step(10)]);
    existingSession(h);
    h.state.saveThrows = true;
    await play(h, { body: GO });
    expect(h.sessions.get(SESSION)!.scene_location_id).toBe(CELLAR);
  });
});

describe("a conversation that begins at a place", () => {
  const START = { campaignId: CAMPAIGN, message: "I look around.", mode: "do", startLocationId: CELLAR };

  it("hands the narrator the place on the very first turn, or it spends that turn searching for it", async () => {
    const h = harness();
    expect(await play(h, { body: START })).toBeNull();
    expect(opening(h.requests[0])).toContain("SCENE-DESCRIPTION");
    expect([...h.sessions.values()][0].scene_location_id).toBe(CELLAR);
  });

  it("refuses a place that is not in the campaign before anything is reserved or any model is called", async () => {
    const h = harness();
    const refusal = await play(h, { body: { ...START, startLocationId: "00000000-0000-4000-8000-0000000000ee" } });
    expect(refusal).toEqual({ status: 404, error: MESSAGES.noPlace });
    expect(h.modelCalls()).toBe(0);
    expect(h.reserved).toEqual([]);
    expect(h.sessions.size).toBe(0);
  });

  it("refuses to move a conversation that is already under way: only the narrator moves the party", async () => {
    const h = harness();
    existingSession(h);
    const refusal = await play(h, { body: { ...START, sessionId: SESSION } });
    expect(refusal?.status).toBe(400);
    expect(h.sessions.get(SESSION)?.scene_location_id).toBeNull();
  });
});

describe("a character remembers in its own words", () => {
  const speakCall = (): ModelStep =>
    step(100, {
      blocks: [{ type: "tool_call", id: "s1", name: "speak", input: { speaker_id: HONEYCOMB, happening: "A stranger swears to come back." } }],
      stop: "tool_calls",
    });
  const answer = "DOES: Nods.\nSAYS: Dusk, then.\nREMEMBERS: promise: The stranger swore to be back by dusk.";
  const script = (): Script => [speakCall(), step(300, { blocks: [{ type: "text", text: answer }] }), step(200)];

  it("files the memory in that character's ledger, or the next sitting meets someone who has forgotten the promise", async () => {
    const h = harness(script());
    await play(h);
    expect(h.memories).toEqual([{ characterId: HONEYCOMB, kind: "promise", body: "The stranger swore to be back by dusk." }]);
  });

  it("never shows the player what a character privately chose to remember", async () => {
    const h = harness(script());
    await play(h);
    expect(JSON.stringify(h.events)).not.toContain("swore to be back");
  });

  it("keeps no memory of a turn that was not saved: the moment never happened", async () => {
    const h = harness(script());
    h.state.conflict = true;
    await play(h);
    expect(h.memories).toEqual([]);
    expect(h.log).not.toContain("memories");
  });

  it("still finishes the turn when the memory cannot be filed", async () => {
    const h = harness(script());
    h.state.memoriesThrow = true;
    await play(h);
    expect(last(h)).toMatchObject({ type: "done" });
  });

  it("files it only after the turn is saved", async () => {
    const h = harness(script());
    await play(h);
    expect(h.log.indexOf("memories")).toBeGreaterThan(h.log.indexOf("save"));
  });
});

describe("a sitting is a play session of the campaign", () => {
  const speakCall = (): ModelStep =>
    step(100, {
      blocks: [{ type: "tool_call", id: "s1", name: "speak", input: { speaker_id: HONEYCOMB, happening: "A stranger swears to come back." } }],
      stop: "tool_calls",
    });
  const remembering = (): Script => [
    speakCall(),
    step(300, { blocks: [{ type: "text", text: "SAYS: Dusk, then.\nREMEMBERS: promise: Back by dusk." }] }),
    step(200),
  ];

  it("stamps what a character remembers with the sitting, or 'what did she promise last time' has no answer", async () => {
    const h = harness(remembering());
    await play(h);
    expect([...h.sessions.values()][0].campaign_session_id).toBe(PLAY_SESSION);
    expect(h.memorySessions).toEqual([PLAY_SESSION]);
  });

  it("records that the conversation started its session, or leaving could never tell whose evening it is", async () => {
    const h = harness();
    await play(h);
    expect([...h.sessions.values()][0].opened_play_session).toBe(true);
  });

  it("records that the conversation only joined a session already running, so leaving will not close it", async () => {
    const h = harness();
    h.state.playSessionJoined = true;
    await play(h);
    expect([...h.sessions.values()][0].opened_play_session).toBe(false);
  });

  it("refuses a turn in a conversation that was left with 409, before anything is reserved", async () => {
    const h = harness();
    existingSession(h, { left_at: "2026-11-17T00:00:00Z" });
    const refusal = await handleAgentTurn({
      userId: DM,
      body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "do" },
      deps: h.deps,
      send: () => {},
    });
    expect(refusal).toEqual({ status: 409, error: MESSAGES.left });
    expect(h.reserved).toEqual([]);
    expect(h.log).not.toContain("open-session");
  });

  it("opens no second session for a conversation already under way: one conversation is one sitting", async () => {
    const h = harness();
    existingSession(h, { campaign_session_id: "00000000-0000-4000-8000-0000000000a8" });
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go", mode: "do" } });
    expect(h.log).not.toContain("open-session");
  });

  it("still plays when the session cannot be opened, with what it writes left undated", async () => {
    const h = harness(remembering());
    h.state.playSessionThrows = true;
    await play(h);
    expect(last(h)).toMatchObject({ type: "done" });
    expect(h.memorySessions).toEqual([null]);
  });
});

describe("the record", () => {
  const BODY = { campaignId: CAMPAIGN, sessionId: SESSION, message: "I hand over the key.", mode: "do" };
  const file = (id: string, input: Record<string, unknown>): ModelStep =>
    step(10, { blocks: [{ type: "tool_call", id, name: "record", input }], stop: "tool_calls" });
  const factEvents = (h: Harness) => h.events.filter((e) => e.type === "fact");
  const resultsSeen = (h: Harness, request: number) =>
    h.requests[request].messages.flatMap((m) => m.blocks).filter((b) => b.type === "tool_result");

  it("keeps the record out of the instructions, or every fact filed costs the whole prompt cache", async () => {
    const h = harness();
    existingSession(h, { scene_location_id: CELLAR, summary: "SUMMARY-MARK the party fled." });
    h.state.record = [{ id: factId(90), body: "RECORD-MARK the debt is forty gold.", hidden: false, when: null }];
    await play(h, { body: BODY });
    expect(h.requests[0].system).not.toContain("RECORD-MARK");
    const sent = opening(h.requests[0]);
    expect(sent.indexOf("RECORD-MARK")).toBeGreaterThan(sent.indexOf("SCENE-DESCRIPTION"));
  });

  it("asks for the record of the party's place and the people in it, in the conversation's campaign", async () => {
    const h = harness();
    existingSession(h, { scene_location_id: CELLAR });
    await play(h, { body: BODY });
    expect(h.recordLoads).toEqual([{ campaignId: CAMPAIGN, locationId: CELLAR, characterIds: [HONEYCOMB] }]);
  });

  it("asks for the campaign's newest facts alone when the party has no place yet", async () => {
    const h = harness();
    existingSession(h);
    await play(h, { body: BODY });
    expect(h.recordLoads).toEqual([{ campaignId: CAMPAIGN, locationId: null, characterIds: [] }]);
  });

  it("still runs the turn when the record cannot be read, and says nothing is on record", async () => {
    const h = harness();
    existingSession(h);
    h.state.recordThrows = true;
    await play(h, { body: BODY });
    expect(last(h)).toMatchObject({ type: "done" });
    expect(opening(h.requests[0])).toContain("Nothing is on record");
  });

  it("offers the record tool to the narrator", async () => {
    const h = harness();
    existingSession(h);
    await play(h, { body: BODY });
    expect(h.requests[0].tools.map((t) => t.name)).toContain("record");
  });

  it("tells the narrator a hidden fact, marked, and sends the browser no event that holds it", async () => {
    const h = harness([file("r1", { fact: "HIDDEN-MARK the duke is the lich.", hidden: true }), step(10)]);
    existingSession(h);
    h.state.record = [{ id: factId(91), body: "HIDDEN-LOADED the cellar hides a door.", hidden: true, when: null }];
    await play(h, { body: BODY });
    expect(opening(h.requests[0])).toContain("HIDDEN-LOADED");
    expect(h.facts).toHaveLength(1);
    const wire = JSON.stringify(h.events);
    expect(wire).not.toContain("HIDDEN-MARK");
    expect(wire).not.toContain("HIDDEN-LOADED");
    expect(factEvents(h)).toEqual([]);
  });

  it("sends a known fact to the browser just before done, in the order filed", async () => {
    const h = harness([
      file("r1", { fact: "Wren gave the key to Honeycomb." }),
      file("r2", { fact: "The cellar door is locked." }),
      step(10),
    ]);
    existingSession(h);
    await play(h, { body: BODY });
    expect(factEvents(h)).toEqual([
      { type: "fact", fact: { id: factId(1), body: "Wren gave the key to Honeycomb." } },
      { type: "fact", fact: { id: factId(2), body: "The cellar door is locked." } },
    ]);
    expect(h.events.indexOf(factEvents(h)[1])).toBe(h.events.length - 2);
  });

  it("announces no fact for a turn that was not kept, and takes the filed ones off the record", async () => {
    const h = harness([file("r1", { fact: "Wren gave the key to Honeycomb." }), step(10)]);
    existingSession(h);
    h.state.conflict = true;
    await play(h, { body: BODY });
    expect(factEvents(h)).toEqual([]);
    expect(h.discards).toEqual([{ campaignId: CAMPAIGN, ids: [factId(1)] }]);
    expect(h.facts).toEqual([]);
  });

  it("takes the filed facts off the record when the turn fails to save, or the player's retry files them twice", async () => {
    const h = harness([file("r1", { fact: "Wren gave the key to Honeycomb." }), step(10)]);
    existingSession(h);
    h.state.saveThrows = true;
    await play(h, { body: BODY });
    expect(h.discards).toEqual([{ campaignId: CAMPAIGN, ids: [factId(1)] }]);
  });

  it("takes the filed facts off the record when the provider fails after filing", async () => {
    const h = harness([file("r1", { fact: "Wren gave the key to Honeycomb." }), new AgentProviderError("down", 500, true)]);
    existingSession(h);
    await play(h, { body: BODY });
    expect(last(h)).toEqual({ type: "error", message: MESSAGES.providerBusy });
    expect(h.discards).toEqual([{ campaignId: CAMPAIGN, ids: [factId(1)] }]);
  });

  it("takes nothing off the record after a kept turn", async () => {
    const h = harness([file("r1", { fact: "Wren gave the key to Honeycomb." }), step(10)]);
    existingSession(h);
    await play(h, { body: BODY });
    expect(h.discards).toEqual([]);
    expect(h.facts).toHaveLength(1);
  });

  it("still reports the conflict when taking the facts back off fails", async () => {
    const h = harness([file("r1", { fact: "Wren gave the key to Honeycomb." }), step(10)]);
    existingSession(h);
    h.state.conflict = true;
    h.state.discardThrows = true;
    await play(h, { body: BODY });
    expect(last(h)).toEqual({ type: "error", message: MESSAGES.conflict });
    expect(h.open.size).toBe(0);
  });

  it("files into the conversation's own campaign and sittings, whatever the model writes", async () => {
    const h = harness([
      file("r1", { fact: "Wren holds the key.", campaign_id: OTHER_CAMPAIGN, agent_session_id: ELSEWHERE, session_id: ELSEWHERE }),
      step(10),
    ]);
    existingSession(h, { campaign_session_id: PLAY_SESSION });
    await play(h, { body: BODY });
    expect(h.facts[0]).toMatchObject({ campaignId: CAMPAIGN, agentSessionId: SESSION, campaignSessionId: PLAY_SESSION });
  });

  it("passes what the fact is about and what it closes through to filing", async () => {
    const h = harness([
      file("r1", { fact: "The key is gone.", about: [{ type: "item", id: HONEYCOMB }], closes: factId(77), hidden: true }),
      step(10),
    ]);
    existingSession(h);
    await play(h, { body: BODY });
    expect(h.facts[0]).toMatchObject({ about: [{ type: "item", id: HONEYCOMB }], closes: factId(77), hidden: true });
  });

  it("answers the narrator with the sentence from filing and announces nothing when filing fails", async () => {
    const h = harness([file("r1", { fact: "The key is gone.", closes: factId(77) }), step(10)]);
    existingSession(h);
    h.state.fileError = "The fact to close was not found.";
    await play(h, { body: BODY });
    expect(resultsSeen(h, 1)).toEqual([
      expect.objectContaining({ content: "The fact to close was not found.", isError: true }),
    ]);
    expect(factEvents(h)).toEqual([]);
    expect(h.discards).toEqual([]);
  });

  it("answers the narrator an error for a fact it refuses to parse, and files nothing", async () => {
    const h = harness([file("r1", { fact: "x", about: [{ type: "weather", id: HONEYCOMB }] }), step(10)]);
    existingSession(h);
    await play(h, { body: BODY });
    expect(resultsSeen(h, 1)[0]).toMatchObject({ isError: true });
    expect(h.facts).toEqual([]);
  });
});

describe("quests and time", () => {
  const BODY = { campaignId: CAMPAIGN, sessionId: SESSION, message: "We swim the channel.", mode: "do" };
  const QUEST = "00000000-0000-4000-8000-000000000a01";
  const THREAD = "00000000-0000-4000-8000-000000000a02";
  const EDGE = "00000000-0000-4000-8000-000000000a03";
  const OBJECTIVE = "00000000-0000-4000-8000-000000000a04";
  const OTHER_CLOCK = "00000000-0000-4000-8000-000000000a05";
  const PRESSURE_CLOCK = "00000000-0000-4000-8000-000000000a06";
  const quests = (filled = 1, withPressure = true): QuestsInPlay => ({
    threads: [{
      questId: QUEST,
      questTitle: "QUEST-MARK the drowned bell",
      threadId: THREAD,
      threadLabel: null,
      beat: { id: "00000000-0000-4000-8000-000000000a07", title: "The crypt" },
      routes: [{ edgeId: EDGE, label: null, toBeatId: "00000000-0000-4000-8000-000000000a08", toBeatTitle: "The bell room", kind: "choice", open: true }],
      objectives: [{ id: OBJECTIVE, description: "Find the bell", status: "pending" }],
      clocks: [{ id: OTHER_CLOCK, label: "Tide", filled: 0, segments: 6 }],
    }],
    pressure: withPressure ? { clockId: PRESSURE_CLOCK, label: "FLOOD-MARK", filled, segments: 4 } : null,
  });
  const callTools = (...calls: Array<[string, Record<string, unknown>]>): ModelStep =>
    step(10, {
      blocks: calls.map(([name, input], i) => ({ type: "tool_call" as const, id: `q${i}`, name, input })),
      stop: "tool_calls",
    });
  const route = (): [string, Record<string, unknown>] => ["quest_route", { quest_id: QUEST, thread_id: THREAD, edge_id: EDGE }];
  const objective = (): [string, Record<string, unknown>] => ["quest_objective", { objective_id: OBJECTIVE, status: "complete", reason: "found it" }];
  const moves = (h: Harness) => h.applied.map((a) => a.move);
  const tick: QuestMove = { kind: "clock", clockId: PRESSURE_CLOCK, step: 1, reason: "a turn passed" };

  it("keeps the quests out of the instructions, between the scene and the record, or every clock tick costs the whole prompt cache", async () => {
    const h = harness();
    existingSession(h, { scene_location_id: CELLAR, summary: "SUMMARY-MARK" });
    h.state.record = [{ id: factId(90), body: "RECORD-MARK the debt.", hidden: false, when: null }];
    h.state.quests = quests();
    await play(h, { body: BODY });
    expect(h.requests[0].system).not.toContain("QUEST-MARK");
    const sent = opening(h.requests[0]);
    const questAt = sent.indexOf("QUEST-MARK");
    expect(questAt).toBeGreaterThan(sent.indexOf("SCENE-DESCRIPTION"));
    expect(sent.indexOf("RECORD-MARK")).toBeGreaterThan(questAt);
  });

  it("sends byte-identical instructions on two turns whose scene, quests and record all differ", async () => {
    // Probed 17 Nov 2026 on gpt-6-luna: one changed sentence in the instructions reads nothing from the prompt cache.
    const a = harness();
    existingSession(a, { scene_location_id: CELLAR });
    a.state.quests = quests(1);
    a.state.record = [{ id: factId(90), body: "RECORD-MARK the debt.", hidden: false, when: null }];
    await play(a, { body: BODY });
    const b = harness();
    existingSession(b);
    b.state.quests = quests(3, false);
    await play(b, { body: BODY });
    expect(a.requests[0].system).toBe(b.requests[0].system);
  });

  it("stores the player's message without the state, so the history never carries a stale scene or record", async () => {
    const h = harness();
    existingSession(h, { scene_location_id: CELLAR });
    h.state.quests = quests();
    h.state.record = [{ id: factId(90), body: "RECORD-MARK the debt.", hidden: false, when: null }];
    await play(h, { body: BODY });
    const saved = JSON.stringify(h.appends);
    expect(saved).toContain("We swim the channel.");
    for (const mark of ["SCENE-DESCRIPTION", "QUEST-MARK", "RECORD-MARK"]) expect(saved).not.toContain(mark);
  });

  it("still shows the state on the later rounds of the same turn, so a round after a tool call is not blind", async () => {
    const h = harness([callTools(route()), step(10)]);
    existingSession(h, { scene_location_id: CELLAR });
    h.state.quests = quests();
    await play(h, { body: BODY });
    expect(opening(h.requests[1])).toContain("SCENE-DESCRIPTION");
    expect(opening(h.requests[1])).toBe(opening(h.requests[0]));
  });

  it("reads the quests of this campaign with the conversation's own pressure clock", async () => {
    const h = harness();
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    await play(h, { body: BODY });
    expect(h.questLoads).toEqual([{ campaignId: CAMPAIGN, pressureClockId: PRESSURE_CLOCK }]);
  });

  it("offers the five quest tools to the narrator", async () => {
    const h = harness();
    existingSession(h);
    await play(h, { body: BODY });
    expect(h.requests[0].tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["quest_route", "quest_beat", "quest_objective", "quest_clock", "pressure"]),
    );
  });

  it("answers the narrator with what will happen and applies nothing while the turn is still running", async () => {
    const h = harness([callTools(route()), step(10)]);
    existingSession(h);
    h.state.quests = quests();
    await play(h, { body: BODY });
    const results = h.requests[1].messages.flatMap((m) => m.blocks).filter((b) => b.type === "tool_result");
    expect(results).toEqual([expect.objectContaining({ isError: false, content: expect.stringContaining("The bell room") })]);
    expect(h.log.indexOf("quest-move")).toBeGreaterThan(h.log.indexOf("save"));
  });

  it("applies the moves in the order they were made, after the turn is saved, as this conversation's DM", async () => {
    const h = harness([callTools(objective(), route()), step(10)]);
    existingSession(h);
    h.state.quests = quests(1, false);
    await play(h, { body: BODY });
    expect(moves(h)).toEqual([
      { kind: "objective", objectiveId: OBJECTIVE, status: "complete", reason: "found it" },
      { kind: "route", questId: QUEST, threadId: THREAD, edgeId: EDGE },
    ]);
    expect(h.applied[0].ctx).toEqual({ campaignId: CAMPAIGN, agentSessionId: SESSION });
    expect(h.log.indexOf("quest-move")).toBeGreaterThan(h.log.lastIndexOf("save"));
    expect(h.log.lastIndexOf("done")).toBeGreaterThan(h.log.lastIndexOf("quest-move"));
  });

  it("applies nothing when the save conflicts, because objectives and clocks cannot be undone", async () => {
    const h = harness([callTools(objective(), route()), step(10)]);
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    h.state.conflict = true;
    await play(h, { body: BODY });
    expect(h.applied).toEqual([]);
  });

  it("applies nothing when the save fails", async () => {
    const h = harness([callTools(objective()), step(10)]);
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    h.state.saveThrows = true;
    await play(h, { body: BODY });
    expect(h.applied).toEqual([]);
  });

  it("applies nothing when the provider fails after a quest tool ran", async () => {
    const h = harness([callTools(objective()), new AgentProviderError("down", 500, true)]);
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    await play(h, { body: BODY });
    expect(last(h)).toEqual({ type: "error", message: MESSAGES.providerBusy });
    expect(h.applied).toEqual([]);
  });

  it("still finishes the turn, and still applies the later moves, when one move fails to apply", async () => {
    const h = harness([callTools(objective(), route()), step(10)]);
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    h.state.failMoveAt = new Set([0]);
    await play(h, { body: BODY });
    expect(moves(h).map((m) => m.kind)).toEqual(["objective", "route", "clock"]);
    expect(last(h)).toMatchObject({ type: "done" });
    expect(h.open.size).toBe(0);
  });

  it("ticks the pressure clock once on a kept turn, after the narrator's own moves", async () => {
    const h = harness([callTools(route()), step(10)]);
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    await play(h, { body: BODY });
    expect(moves(h)).toEqual([{ kind: "route", questId: QUEST, threadId: THREAD, edgeId: EDGE }, tick]);
  });

  it("lets go of the clock on the turn it fills, so later turns are not told again that it fills", async () => {
    const h = harness();
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests(3);
    await play(h, { body: BODY });
    expect(moves(h)).toEqual([tick, { kind: "pressure", mode: "stop" }]);
    // The page still sees it full this turn.
    expect(h.events.filter((e) => e.type === "pressure")).toEqual([{ type: "pressure", pressure: { filled: 4, segments: 4 } }]);
  });

  it("ticks nothing on a turn that is not kept", async () => {
    const h = harness();
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    h.state.conflict = true;
    await play(h, { body: BODY });
    expect(h.applied).toEqual([]);
  });

  it("does not tick a second time when the narrator ticked that clock itself this turn", async () => {
    const h = harness([callTools(["quest_clock", { clock_id: PRESSURE_CLOCK, reason: "the horn sounds" }]), step(10)]);
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    await play(h, { body: BODY });
    expect(moves(h)).toEqual([{ kind: "clock", clockId: PRESSURE_CLOCK, step: 1, reason: "the horn sounds" }]);
  });

  it("does not tick on the turn the narrator stops the pressure", async () => {
    const h = harness([callTools(["pressure", { stop: true }]), step(10)]);
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    await play(h, { body: BODY });
    expect(moves(h)).toEqual([{ kind: "pressure", mode: "stop" }]);
  });

  const pressureEvents = (h: Harness) => h.events.filter((e) => e.type === "pressure");

  it("tells the page how full the clock is after a kept turn, and never its label", async () => {
    const h = harness();
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests(1);
    await play(h, { body: BODY });
    expect(pressureEvents(h)).toEqual([{ type: "pressure", pressure: { filled: 2, segments: 4 } }]);
    expect(JSON.stringify(h.events)).not.toContain("FLOOD-MARK");
  });

  it("tells the page the pressure is off on the turn the narrator stops it, or the clock stays on screen", async () => {
    const h = harness([callTools(["pressure", { stop: true }]), step(10)]);
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.quests = quests();
    await play(h, { body: BODY });
    expect(pressureEvents(h)).toEqual([{ type: "pressure", pressure: null }]);
  });

  it("says nothing of pressure at a table that is under none, and nothing on a turn that is not kept", async () => {
    const calm = harness();
    existingSession(calm);
    calm.state.quests = quests(0, false);
    await play(calm, { body: BODY });
    expect(pressureEvents(calm)).toEqual([]);

    const lost = harness();
    existingSession(lost, { pressure_clock_id: PRESSURE_CLOCK });
    lost.state.quests = quests();
    lost.state.conflict = true;
    await play(lost, { body: BODY });
    expect(pressureEvents(lost)).toEqual([]);
  });

  it("ticks nothing when the scene is under no pressure", async () => {
    const h = harness();
    existingSession(h);
    h.state.quests = quests(0, false);
    await play(h, { body: BODY });
    expect(h.applied).toEqual([]);
  });

  it("tells the narrator the clock fills this turn when one more tick fills it, and not a turn earlier", async () => {
    const early = harness();
    existingSession(early, { pressure_clock_id: PRESSURE_CLOCK });
    early.state.quests = quests(2);
    await play(early, { body: BODY });
    const late = harness();
    existingSession(late, { pressure_clock_id: PRESSURE_CLOCK });
    late.state.quests = quests(3);
    await play(late, { body: BODY });
    // The standing text mentions filling too, so look only at the quests' own section.
    const section = (sent: string) => sent.slice(sent.indexOf("## Quests in play"), sent.indexOf("## On record"));
    expect(section(opening(early.requests[0]))).toContain("FLOOD-MARK");
    expect(section(opening(early.requests[0]))).not.toMatch(/fills/);
    expect(section(opening(late.requests[0]))).toMatch(/fills/);
  });

  it("runs the turn without any quest tool when the quests cannot be read, since their ids could not be checked", async () => {
    const h = harness();
    existingSession(h, { pressure_clock_id: PRESSURE_CLOCK });
    h.state.questsThrow = true;
    await play(h, { body: BODY });
    expect(last(h)).toMatchObject({ type: "done" });
    const offered = h.requests[0].tools.map((t) => t.name);
    for (const name of ["quest_route", "quest_beat", "quest_objective", "quest_clock", "pressure"]) {
      expect(offered).not.toContain(name);
    }
    expect(opening(h.requests[0])).toContain("No quest is under way");
    expect(h.applied).toEqual([]);
  });

  it("refuses an id that was not in the section even when the model writes a plausible one", async () => {
    const h = harness([callTools(["quest_route", { quest_id: QUEST, thread_id: THREAD, edge_id: "00000000-0000-4000-8000-000000000bad" }]), step(10)]);
    existingSession(h);
    h.state.quests = quests(1, false);
    await play(h, { body: BODY });
    expect(h.requests[1].messages.flatMap((m) => m.blocks).filter((b) => b.type === "tool_result")).toEqual([
      expect.objectContaining({ isError: true }),
    ]);
    expect(h.applied).toEqual([]);
  });
});

describe("a recorded character is played as themselves, where the party is", () => {
  const call = (name: string, input: Record<string, unknown>): ModelStep =>
    step(100, { blocks: [{ type: "tool_call", id: "s1", name, input }], stop: "tool_calls" });

  it("refuses a nameless stand-in for someone with a record, and makes no call for them", async () => {
    const h = harness([call("speak", { speaker_name: "Honeycomb", manner: "sweet", happening: "A stranger asks about the promise." }), step(200)]);
    await play(h);
    // Two narrator calls and no third: the stand-in was never given a voice.
    expect(h.modelCalls()).toBe(2);
    const answer = JSON.stringify(h.requests[1].messages);
    expect(answer).toContain(HONEYCOMB);
    expect(h.events.some((e) => e.type === "line")).toBe(false);
  });

  it("refuses a narrator-written deed for someone with a record named only by name", async () => {
    const h = harness([call("act", { speaker_name: "Apprentice Honeycomb", what: "Forgets everything." }), step(200)]);
    await play(h);
    expect(h.events.some((e) => e.type === "line")).toBe(false);
  });

  it("puts a character who spoke where the party is, or the next sitting finds the place empty", async () => {
    const h = harness([
      call("speak", { speaker_id: HONEYCOMB, happening: "A stranger greets you." }),
      step(300, { blocks: [{ type: "text", text: "SAYS: Hello." }] }),
      step(200),
    ]);
    existingSession(h, { scene_location_id: CELLAR });
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "Hello.", mode: "say" } });
    expect(h.placed).toEqual([{ campaignId: CAMPAIGN, locationId: CELLAR, characterIds: [HONEYCOMB] }]);
  });

  it("moves nobody when the party has no place, and nobody when the turn was not kept", async () => {
    const speaking = (): Script => [
      call("speak", { speaker_id: HONEYCOMB, happening: "A stranger greets you." }),
      step(300, { blocks: [{ type: "text", text: "SAYS: Hello." }] }),
      step(200),
    ];
    const nowhere = harness(speaking());
    await play(nowhere);
    expect(nowhere.placed).toEqual([]);

    const lost = harness(speaking());
    existingSession(lost, { scene_location_id: CELLAR });
    lost.state.conflict = true;
    await play(lost, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "Hello.", mode: "say" } });
    expect(lost.placed).toEqual([]);
  });
});

describe("companions travel with the party", () => {
  it("puts whoever came along at the new place, or the next scene has lost the friend who walked in with you", async () => {
    const go: ModelStep = step(100, {
      blocks: [{ type: "tool_call", id: "g1", name: "go_to", input: { location_id: CELLAR, with: [HONEYCOMB] } }],
      stop: "tool_calls",
    });
    const h = harness([go, step(200)]);
    await play(h);
    expect(h.placed).toEqual([{ campaignId: CAMPAIGN, locationId: CELLAR, characterIds: [HONEYCOMB] }]);
  });
});

describe("narration sentences that only repeat the characters are held back", () => {
  const speak = (id = "s1", over: Partial<ModelStep> = {}): ModelStep =>
    step(10, {
      blocks: [{ type: "tool_call", id, name: "speak", input: { speaker_id: HONEYCOMB, happening: "A stranger asks who you are." } }],
      stop: "tool_calls",
      ...over,
    });
  const sheSays = (text: string): ModelStep => step(10, { blocks: [{ type: "text", text: `SAYS: ${text}` }] });
  /** A narrator step whose text streams to the browser as it is written, as a real adapter does. */
  const writes = (text: string, over: Partial<ModelStep> = {}): ((request: ModelRequest) => ModelStep) => (request) => {
    request.onText?.(text);
    return step(10, { blocks: [{ type: "text", text }], ...over });
  };
  /** A judge that scores each sentence by what it says, and keeps every request it was sent. */
  const judgeBy = (score: (sentence: string) => number | null) => {
    const requests: JudgeRequest[] = [];
    const judge = async (request: JudgeRequest): Promise<JudgeResult> => {
      requests.push(request);
      const sentences = (request.state as { sentences: string[] }).sentences;
      const answers: JudgeResult["answers"] = {};
      sentences.forEach((sentence, i) => {
        const noul = score(sentence);
        if (noul !== null) answers[`s${i}`] = { type: "noul", noul };
      });
      return { model: "jev-1", inputTokens: 5, answers };
    };
    return { judge, requests };
  };
  const texts = (h: Harness) => h.events.flatMap((e) => (e.type === "text" ? [e.delta] : []));
  const assistantBlocks = (h: Harness) => h.appends[0].rows.filter((r) => r.role === "assistant").flatMap((r) => r.blocks);

  it("sends the browser no text event for narration the judge says only restates, and stores it marked unshown", async () => {
    const h = harness([speak(), sheSays("Hello."), writes("Honeycomb still stands waiting.")]);
    h.deps.judgeNarration = judgeBy(() => 0.1).judge;
    await play(h);
    expect(texts(h)).toEqual([]);
    expect(h.events.some((e) => e.type === "line")).toBe(true);
    expect(JSON.stringify(h.events)).not.toContain("still stands waiting");
    const held = assistantBlocks(h).find((b) => b.type === "text");
    expect(held).toMatchObject({ type: "text", text: "Honeycomb still stands waiting.", unshown: true });
    expect(last(h)).toMatchObject({ type: "done", end: "done" });
  });

  it("shows narration the judge says adds something once, whole, after the line it follows", async () => {
    const h = harness([speak(), sheSays("Hello."), writes("Rain "), ]);
    h.script[2] = (request) => {
      request.onText?.("Rain starts ");
      request.onText?.("to fall.");
      return step(10, { blocks: [{ type: "text", text: "Rain starts to fall." }] });
    };
    h.deps.judgeNarration = judgeBy(() => 0.9).judge;
    await play(h);
    expect(texts(h)).toEqual(["Rain starts to fall."]);
    const kinds = h.events.map((e) => e.type);
    expect(kinds.indexOf("text")).toBeGreaterThan(kinds.lastIndexOf("line"));
    expect(assistantBlocks(h).find((b) => b.type === "text")).toEqual({ type: "text", text: "Rain starts to fall." });
  });

  it("streams narration that comes before any line as it is written and never judges it", async () => {
    const j = judgeBy(() => 0);
    const h = harness([
      writes("The cellar is cold.", { blocks: [{ type: "text", text: "The cellar is cold." }, { type: "tool_call", id: "r1", name: "roll", input: { expression: "1d20" } }], stop: "tool_calls" }),
      writes("You find nothing."),
    ]);
    h.deps.judgeNarration = j.judge;
    await play(h);
    expect(texts(h)).toEqual(["The cellar is cold.", "You find nothing."]);
    expect(j.requests).toHaveLength(0);
    expect(assistantBlocks(h).some((b) => b.type === "text" && b.unshown)).toBe(false);
  });

  it("shows everything when there is no judge, or the held-back text would vanish for an account with no key", async () => {
    const h = harness([speak(), sheSays("Hello."), writes("Honeycomb still stands waiting.")]);
    await play(h);
    expect(texts(h)).toEqual(["Honeycomb still stands waiting."]);
    expect(assistantBlocks(h).some((b) => b.type === "text" && b.unshown)).toBe(false);
  });

  it("shows the text when the judge throws, because a narrator the player cannot read is worse than a repeat", async () => {
    const h = harness([speak(), sheSays("Hello."), writes("Honeycomb still stands waiting.")]);
    h.deps.judgeNarration = async () => {
      throw new Error("typesafe down");
    };
    await play(h);
    expect(texts(h)).toEqual(["Honeycomb still stands waiting."]);
    expect(assistantBlocks(h).some((b) => b.type === "text" && b.unshown)).toBe(false);
    expect(last(h)).toMatchObject({ type: "done" });
  });

  it("shows the text when the judge is slower than the limit, and does not wait for it", async () => {
    vi.useFakeTimers();
    try {
      const h = harness([speak(), sheSays("Hello."), writes("Honeycomb still stands waiting.")]);
      h.deps.judgeNarration = () => new Promise<JudgeResult>(() => {});
      const turn = play(h);
      await vi.advanceTimersByTimeAsync(1_499);
      expect(texts(h)).toEqual([]);
      await vi.advanceTimersByTimeAsync(2);
      await turn;
      expect(texts(h)).toEqual(["Honeycomb still stands waiting."]);
      expect(assistantBlocks(h).some((b) => b.type === "text" && b.unshown)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("judges against this turn's shown lines only, and never judges a turn that showed none, whatever the history holds", async () => {
    const j = judgeBy(() => 0.9);
    const h = harness([writes("Rain falls on the roof.")]);
    existingSession(h);
    h.turns.push(
      { seq: 1, role: "user", blocks: [{ type: "text", text: "hi" }] },
      { seq: 2, role: "assistant", blocks: [{ type: "tool_call", id: "old", name: "speak", input: {} }] },
      {
        seq: 3,
        role: "user",
        blocks: [{ type: "tool_result", callId: "old", content: "ok", isError: false, lines: [{ kind: "spoken", speaker: { id: HONEYCOMB, name: "Honeycomb" }, text: "EARLIER-LINE" }] }],
      },
    );
    h.deps.judgeNarration = j.judge;
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "Hello.", mode: "say" } });
    expect(j.requests).toHaveLength(0);
    expect(texts(h)).toEqual(["Rain falls on the roof."]);

    const h2 = harness([speak(), sheSays("Fresh words."), writes("Rain falls on the roof.")]);
    existingSession(h2);
    h2.turns.push(...h.turns);
    h2.deps.judgeNarration = j.judge;
    await play(h2, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "Hello.", mode: "say" } });
    const sent = JSON.stringify(j.requests);
    expect(sent).toContain("Fresh words.");
    expect(sent).not.toContain("EARLIER-LINE");
  });

  it("sends the judge nothing a listener held back or a tool was given", async () => {
    const j = judgeBy(() => 0.9);
    const h = harness([
      speak("s1", { blocks: [{ type: "tool_call", id: "s1", name: "speak", input: { speaker_id: HONEYCOMB, happening: "SECRET-HAPPENING", present: [BRAM] } }] }),
      step(10, { blocks: [{ type: "text", text: "SAYS: Hello, everyone.\nTO: everyone" }] }),
      step(10, { blocks: [{ type: "text", text: "SAYS: HELD-BACK-SENTENCE\nWANT: 3" }] }),
      writes("The lamp gutters."),
    ]);
    h.deps.judgeNarration = j.judge;
    await play(h);
    expect(j.requests).toHaveLength(1);
    const sent = JSON.stringify(j.requests);
    for (const secret of ["HELD-BACK-SENTENCE", "SECRET-HAPPENING", "HONEYCOMB-SECRET", "RESULT-SECRET"]) expect(sent).not.toContain(secret);
    expect(sent).toContain("Hello, everyone.");
    expect((j.requests[0].state as { lines: unknown[] }).lines).toEqual([{ who: "Honeycomb", kind: "said", text: "Hello, everyone." }]);
  });

  it("judges text that an abort left unclosed, instead of losing it, and shows it when it adds something", async () => {
    const stop = new AbortController();
    const h = harness([
      speak(),
      sheSays("Hello."),
      (request) => {
        request.onText?.("Thunder rolls.");
        stop.abort();
        throw new Error("the connection was cut");
      },
    ]);
    h.deps.judgeNarration = judgeBy(() => 0.9).judge;
    await play(h, { signal: stop.signal });
    expect(texts(h)).toEqual(["Thunder rolls."]);
    expect(last(h)).toMatchObject({ type: "done", end: "aborted" });
  });

  it("does not mark a stored message whose text is not what was held back, so nothing it cannot identify is hidden", async () => {
    const h = harness([
      speak(),
      sheSays("Hello."),
      (request) => {
        request.onText?.("What was streamed.");
        return step(10, { blocks: [{ type: "text", text: "What was stored." }] });
      },
    ]);
    h.deps.judgeNarration = judgeBy(() => 0.1).judge;
    await play(h);
    expect(texts(h)).toEqual([]);
    expect(assistantBlocks(h).find((b) => b.type === "text" && b.text === "What was stored.")).toEqual({ type: "text", text: "What was stored." });
  });

  it("settles a step's text before the lines a later step produces, and marks only the step that was dropped", async () => {
    const h = harness([
      speak("s1"),
      sheSays("First."),
      writes("A cold draught.", { blocks: [{ type: "text", text: "A cold draught." }, { type: "tool_call", id: "s2", name: "speak", input: { speaker_id: HONEYCOMB, happening: "She notices." } }], stop: "tool_calls" }),
      sheSays("Second."),
      writes("Honeycomb is still talking."),
    ]);
    // Slow enough that a later line would overtake the text if the page did not wait for it.
    const scored = judgeBy((n) => (n.includes("draught") ? 0.9 : 0.1));
    h.deps.judgeNarration = async (request) => {
      await new Promise((r) => setTimeout(r, 30));
      return scored.judge(request);
    };
    await play(h);
    const order = h.events.flatMap((e) => (e.type === "line" ? [e.line.text] : e.type === "text" ? [`T:${e.delta}`] : []));
    expect(order).toEqual(["First.", "T:A cold draught.", "Second."]);
    const blocks = assistantBlocks(h).filter((b) => b.type === "text");
    expect(blocks).toEqual([
      { type: "text", text: "A cold draught." },
      { type: "text", text: "Honeycomb is still talking.", unshown: true },
    ]);
  });

  const MIX = "The cedar door gives no sound. Honeycomb watches you, waiting.";
  const addsFirst = (sentence: string) => (sentence.startsWith("The cedar") ? 0.99 : 0.1);

  it("shows exactly the sentence that adds something and stores the message holding exactly that, so the next turn reads what the player read", async () => {
    const h = harness([speak(), sheSays("Hello."), writes(MIX)]);
    h.deps.judgeNarration = judgeBy(addsFirst).judge;
    await play(h);
    expect(texts(h)).toEqual(["The cedar door gives no sound."]);
    expect(assistantBlocks(h).filter((b) => b.type === "text" && b.text.includes("cedar"))).toEqual([{ type: "text", text: "The cedar door gives no sound." }]);
    expect(JSON.stringify(h.appends[0].rows)).not.toContain("watches you");
  });

  it("leaves the stored text byte-identical when every sentence is kept", async () => {
    const text = "Rain falls.\n\nThunder   rolls.";
    const h = harness([speak(), sheSays("Hello."), writes(text)]);
    h.deps.judgeNarration = judgeBy(() => 0.95).judge;
    await play(h);
    expect(texts(h)).toEqual([text]);
    expect(assistantBlocks(h).find((b) => b.type === "text" && b.text === text)).toEqual({ type: "text", text });
  });

  it("keeps a sentence whose answer is missing, so one lost answer does not hide an event", async () => {
    const h = harness([speak(), sheSays("Hello."), writes(MIX)]);
    h.deps.judgeNarration = judgeBy((s) => (s.startsWith("The cedar") ? null : 0.1)).judge;
    await play(h);
    expect(texts(h)).toEqual(["The cedar door gives no sound."]);
  });

  it("shows sentences beyond the eighth unjudged", async () => {
    const text = Array.from({ length: 10 }, (_, i) => `Sentence ${i}.`).join(" ");
    const j = judgeBy(() => 0.05);
    const h = harness([speak(), sheSays("Hello."), writes(text)]);
    h.deps.judgeNarration = j.judge;
    await play(h);
    expect((j.requests[0].state as { sentences: string[] }).sentences).toHaveLength(8);
    expect(texts(h)).toEqual(["Sentence 8. Sentence 9."]);
  });

  it("ends a message that had two text blocks with one block holding the kept text and no empty block", async () => {
    const h = harness([
      speak(),
      sheSays("Hello."),
      writes("The cedar door gives no sound. Honeycomb waits.", {
        blocks: [
          { type: "text", text: "The cedar door gives no sound. " },
          { type: "text", text: "Honeycomb waits." },
        ],
      }),
    ]);
    h.deps.judgeNarration = judgeBy(addsFirst).judge;
    await play(h);
    const blocks = assistantBlocks(h).filter((b) => b.type === "text" && !b.text.startsWith("SAYS"));
    expect(blocks).toEqual([{ type: "text", text: "The cedar door gives no sound." }]);
    expect(assistantBlocks(h).some((b) => b.type === "text" && b.text === "")).toBe(false);
  });

  it("still sends done after text the judge is slow to clear, never before it", async () => {
    const h = harness([speak(), sheSays("Hello."), writes("Wind in the eaves.")]);
    h.deps.judgeNarration = async (request) => {
      await new Promise((r) => setTimeout(r, 20));
      return judgeBy(() => 0.9).judge(request);
    };
    await play(h);
    const kinds = h.events.map((e) => e.type);
    expect(kinds.indexOf("text")).toBeLessThan(kinds.indexOf("done"));
  });
});

describe("who the player plays", () => {
  const wren = (): PlayerCharacter => ({
    id: WREN, name: "Wren Ashfield", pronouns: "she/her", species: "Wood Elf", className: "Ranger", subclass: null,
    level: 3, hitPoints: { current: 12, max: 20 },
  });
  const START = { campaignId: CAMPAIGN, message: "I look around.", mode: "do", startLocationId: CELLAR, characterId: WREN };
  const withWren = (script: Script = [step(100)]): Harness => {
    const h = harness(script);
    h.state.characters.set(WREN, wren());
    return h;
  };
  const speakWithPlayerWords = (present: string[] = []): ModelStep =>
    step(100, {
      blocks: [{
        type: "tool_call", id: "s1", name: "speak",
        input: { speaker_id: HONEYCOMB, happening: "A stranger asks about the cellar.", player_said: "Is the cellar safe?", present },
      }],
      stop: "tool_calls",
    });
  const answering = (text: string): Script => [speakWithPlayerWords(), step(100, { blocks: [{ type: "text", text }] }), step(50)];
  // Honeycomb turns to Bram, who was in the room and so is told what the player said; he has nothing to add.
  const toBram: Script = [
    speakWithPlayerWords([BRAM]),
    step(100, { blocks: [{ type: "text", text: "SAYS: Ask Bram.\nTO: Bram" }] }),
    step(100, { blocks: [{ type: "text", text: "DOES: -\nSAYS: -" }] }),
    step(50),
  ];

  it("refuses a character of another campaign before anything is reserved or any model is called", async () => {
    const h = harness();
    // The harness, like the database, finds a character only in the campaign that was asked about.
    const foreign = "00000000-0000-4000-8000-0000000000ee";
    characterLoads.length = 0;
    const refusal = await play(h, { body: { ...START, characterId: foreign } });
    expect(characterLoads).toEqual([{ campaignId: CAMPAIGN, characterId: foreign }]);
    expect(refusal).toEqual({ status: 404, error: MESSAGES.noCharacter });
    expect(h.modelCalls()).toBe(0);
    expect(h.reserved).toEqual([]);
    expect(h.sessions.size).toBe(0);
  });

  it("refuses a character sent with a conversation already under way: who is played is chosen once", async () => {
    const h = withWren();
    existingSession(h);
    const refusal = await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, characterId: WREN, message: "hi", mode: "say" } });
    expect(refusal).toEqual({ status: 400, error: MESSAGES.badBody });
    expect(h.sessions.get(SESSION)!.party_member_id).toBeNull();
    expect(h.modelCalls()).toBe(0);
  });

  it("refuses a character id that is not a uuid", async () => {
    const h = withWren();
    expect((await play(h, { body: { ...START, characterId: "wren" } }))?.status).toBe(400);
  });

  it("keeps the character on the conversation, so a later turn that sends no id is still told who is played", async () => {
    const h = withWren([step(100), step(100)]);
    await play(h, { body: START });
    const id = [...h.sessions.keys()][0];
    expect(h.sessions.get(id)!.party_member_id).toBe(WREN);
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: id, message: "And now?", mode: "say" } });
    expect(h.requests[1].system).toContain("Wren Ashfield");
    expect(h.events.filter((e) => e.type === "session")).toEqual([
      { type: "session", sessionId: id, character: { id: WREN, name: "Wren Ashfield" } },
      { type: "session", sessionId: id, character: { id: WREN, name: "Wren Ashfield" } },
    ]);
  });

  it("puts the character in the instructions after the campaign section, where it is cached with them", async () => {
    const h = withWren();
    await play(h, { body: START });
    const system = h.requests[0].system;
    const campaignAt = system.indexOf("Campaign: Cup Town");
    const characterAt = system.indexOf("## The player's character");
    expect(campaignAt).toBeGreaterThan(-1);
    expect(characterAt).toBeGreaterThan(campaignAt);
    expect(system).toContain("level 3 Wood Elf Ranger; hit points 12 of 20");
  });

  it("adds no section for a conversation without a character", async () => {
    const h = harness();
    await play(h, { body: { ...START, characterId: undefined } });
    expect(h.requests[0].system).not.toContain("The player's character\n");
    expect(h.events[0]).toEqual({ type: "session", sessionId: expect.any(String) });
  });

  it("still runs the turn, without the section, when the character cannot be read afterwards", async () => {
    const h = withWren();
    existingSession(h, { party_member_id: WREN });
    h.state.characterThrows = true;
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi", mode: "say" } });
    expect(last(h)).toMatchObject({ type: "done" });
    expect(h.requests[0].system).not.toContain("Wren Ashfield");
    expect(h.events[0]).toEqual({ type: "session", sessionId: SESSION });
  });

  it("tells a character the player's words under the character's name, not the fixed one", async () => {
    const h = withWren([...toBram]);
    await play(h, { body: START });
    const asked = JSON.stringify(h.requests[2].messages);
    expect(asked).toContain("Wren Ashfield said: Is the cellar safe?");
    expect(asked).not.toContain("The player's character said");
  });

  it("tells a character the player's words under the fixed name when the conversation has no character", async () => {
    const h = harness([...toBram]);
    await play(h, { body: { ...START, characterId: undefined } });
    expect(JSON.stringify(h.requests[2].messages)).toContain("The player's character said: Is the cellar safe?");
  });

  const endedOf = (h: Harness): string[] =>
    h.turns.flatMap((t) => blocksOf(t)).flatMap((b) => (b.type === "tool_result" ? [String(JSON.parse(b.content).ended)] : []));

  it("ends the exchange as to_player when a character answers TO the player's character by name", async () => {
    const h = withWren(answering("SAYS: Safe enough, Wren.\nTO: Wren"));
    await play(h, { body: START });
    expect(endedOf(h)).toEqual(["to_player"]);
  });

  it("does not end the exchange on a name that is not the player's", async () => {
    const h = withWren(answering("SAYS: Safe enough.\nTO: Wrenfield"));
    await play(h, { body: START });
    expect(endedOf(h)).toEqual(["open"]);
  });

  it("sends the browser only the character's id and name, never anything else held about them", async () => {
    const h = harness();
    h.state.characters.set(WREN, { ...wren(), ...({ notes: "PRIVATE-CHARACTER-NOTE" } as object) });
    await play(h, { body: START });
    expect(JSON.stringify(h.events)).not.toContain("PRIVATE-CHARACTER-NOTE");
    expect(h.events[0]).toEqual({ type: "session", sessionId: expect.any(String), character: { id: WREN, name: "Wren Ashfield" } });
    expect(h.requests[0].system).not.toContain("PRIVATE-CHARACTER-NOTE");
  });
});

describe("a roll that is the player's", () => {
  const wren = (): PlayerCharacter => ({
    id: WREN, name: "Wren Ashfield", pronouns: null, species: null, className: "Ranger", subclass: null, level: 3, hitPoints: null,
  });
  // The DC is 17 so it can be told apart from every other number in these tests.
  const asked = (): PendingRoll => ({ label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception", dc: 17 });
  const askStep = (input: Record<string, unknown> = { kind: "check", skill: "perception", dc: 17 }): ModelStep =>
    step(10, { blocks: [{ type: "tool_call", id: "r1", name: "ask_roll", input }], stop: "tool_calls" });
  const played = (script: Script = [step(100)], over: Partial<SessionRow> = {}): Harness => {
    const h = harness(script);
    h.state.characters.set(WREN, wren());
    existingSession(h, { party_member_id: WREN, ...over });
    return h;
  };
  const SAY = { campaignId: CAMPAIGN, sessionId: SESSION, message: "I listen at the door.", mode: "do" };
  const ROLL = { faces: [13], mode: "normal", bonus: 4, atTable: true };
  const firstUser = (h: Harness) => h.requests[0].messages[h.requests[0].messages.length - 1].blocks[0];

  it("stores what the narrator asked for once the turn is kept and tells the page what to roll, never the DC", async () => {
    const h = played([askStep(), step(10)]);
    await play(h, { body: SAY });
    expect(h.pendingRolls).toEqual([{ sessionId: SESSION, campaignId: CAMPAIGN, pending: asked() }]);
    const event = h.events.find((e) => e.type === "ask_roll");
    expect(event).toEqual({ type: "ask_roll", roll: { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception" } });
    expect(JSON.stringify(h.events)).not.toContain("17");
  });

  it("asks for nothing when the turn is not kept, or the page would wait for a roll the story never reached", async () => {
    const h = played([askStep(), step(10)]);
    h.state.conflict = true;
    await play(h, { body: SAY });
    expect(h.pendingRolls).toEqual([]);
    expect(h.events.some((e) => e.type === "ask_roll")).toBe(false);
  });

  it("does not tell the page to roll when the request could not be stored, since the roll it sent back would be refused", async () => {
    const h = played([askStep(), step(10)]);
    h.state.pendingRollFails = true;
    await play(h, { body: SAY });
    expect(h.events.some((e) => e.type === "ask_roll")).toBe(false);
    expect(last(h)).toMatchObject({ type: "done" });
  });

  it("scores the player's roll against the stored DC and tells the narrator the outcome, the page only the arithmetic", async () => {
    // SRD 5.1 "Ability Checks": 13 + 4 = 17 meets DC 17, a success.
    const h = played([step(100)], { pending_roll: asked() });
    await play(h, { body: { ...SAY, message: "", roll: ROLL } });
    const block = firstUser(h);
    expect(block.type === "text" && block.text).toContain("d20 (13) + 4 = 17 against DC 17. It succeeds");
    const rolled = { label: "Wisdom (Perception)", faces: [13], kept: 13, bonus: 4, total: 17, mode: "normal", atTable: true };
    expect(h.events[1]).toEqual({ type: "rolled", roll: rolled });
    expect(block).toMatchObject({ roll: rolled });
    // No words were sent, so there is no player line to draw.
    expect(block.type === "text" && block.player).toBeUndefined();
  });

  it("tells the narrator a roll one under the DC fails", async () => {
    const h = played([step(100)], { pending_roll: asked() });
    await play(h, { body: { ...SAY, message: "", roll: { ...ROLL, faces: [12] } } });
    const block = firstUser(h);
    expect(block.type === "text" && block.text).toContain("It fails");
  });

  it("keeps the player's own words after the roll, so what they say with it is not lost", async () => {
    const h = played([step(100)], { pending_roll: asked() });
    await play(h, { body: { ...SAY, roll: ROLL } });
    const block = firstUser(h);
    expect(block.type === "text" && block.text.indexOf("against DC 17")).toBeLessThan(block.type === "text" ? block.text.indexOf("I listen at the door.") : -1);
    expect(block).toMatchObject({ player: { kind: "do", text: "I listen at the door." } });
  });

  it("clears the request once a kept turn answered it, so the same roll cannot be sent twice", async () => {
    const h = played([step(100)], { pending_roll: asked() });
    await play(h, { body: { ...SAY, message: "", roll: ROLL } });
    expect(h.pendingRolls).toEqual([{ sessionId: SESSION, campaignId: CAMPAIGN, pending: null }]);
  });

  it("leaves the request standing when the turn that answered it is not kept, so the player's retry still has a DC", async () => {
    const h = played([step(100)], { pending_roll: asked() });
    h.state.conflict = true;
    await play(h, { body: { ...SAY, message: "", roll: ROLL } });
    expect(h.pendingRolls).toEqual([]);
  });

  it("drops the request when the player sends something else, and tells the narrator they did not roll", async () => {
    const h = played([step(100)], { pending_roll: asked() });
    await play(h, { body: SAY });
    const block = firstUser(h);
    expect(block.type === "text" && block.text).toContain("did not make it");
    expect(block.type === "text" && block.roll).toBeUndefined();
    expect(h.pendingRolls).toEqual([{ sessionId: SESSION, campaignId: CAMPAIGN, pending: null }]);
    expect(h.events.some((e) => e.type === "rolled")).toBe(false);
  });

  it("refuses a roll nobody asked for before anything is reserved or sent to the model", async () => {
    const h = played();
    expect((await play(h, { body: { ...SAY, roll: ROLL } }))?.status).toBe(400);
    const fresh = harness();
    expect((await play(fresh, { body: { campaignId: CAMPAIGN, message: "hi", mode: "say", roll: ROLL } }))?.status).toBe(400);
    expect(h.modelCalls() + fresh.modelCalls()).toBe(0);
  });

  it("refuses a turn with neither words nor a roll, and a roll it cannot read", async () => {
    const h = played([step(100)], { pending_roll: asked() });
    expect((await play(h, { body: { ...SAY, message: "  " } }))?.status).toBe(400);
    expect((await play(h, { body: { ...SAY, message: "", roll: { ...ROLL, faces: [21] } } }))?.status).toBe(400);
    expect(h.modelCalls()).toBe(0);
  });

  it("does not offer ask_roll when nobody is played, so the narrator rolls as before", async () => {
    const h = harness();
    existingSession(h);
    await play(h, { body: SAY });
    expect(h.requests[0].tools.map((t) => t.name)).not.toContain("ask_roll");
    const withWren = played();
    await play(withWren, { body: SAY });
    expect(withWren.requests[0].tools.map((t) => t.name)).toContain("ask_roll");
  });

  it("a new request replaces the answered one in a single write, so the session never holds a stale DC", async () => {
    const h = played([askStep({ kind: "save", ability: "con", dc: 12 }), step(10)], { pending_roll: asked() });
    await play(h, { body: { ...SAY, message: "", roll: ROLL } });
    expect(h.pendingRolls.map((p) => p.pending?.label ?? null)).toEqual(["Constitution saving throw"]);
  });
});

describe("the Dungeon Master's own rolls", () => {
  const BODY = { campaignId: CAMPAIGN, sessionId: SESSION, message: "I greet her.", mode: "say" };
  const rollStep = (): ModelStep =>
    step(10, { blocks: [{ type: "tool_call", id: "d1", name: "roll", input: { expression: "1d20+2", label: "Warmth" } }], stop: "tool_calls" });
  const open = (over: Record<string, unknown> = {}) => ({
    content: JSON.stringify({ total: 17, label: "Warmth", faces: [15], dropped_faces: [], modifier: 2, hidden: false, message_id: "ROLL-MESSAGE-ID", ...over }),
    isError: false,
  });
  const shown = { label: "Warmth", dice: "1d20+2", faces: [15], dropped: [], modifier: 2, total: 17 };
  const rolls = (h: Harness) => h.events.filter((e) => e.type === "dm_roll");
  const savedResults = (h: Harness) =>
    h.appends.flatMap((a) => a.rows).flatMap((r) => r.blocks).filter((b) => b.type === "tool_result");

  it("shows an open roll on the page and keeps it on the stored result, so a reload draws it again", async () => {
    const h = harness([rollStep(), step(10, { blocks: [{ type: "text", text: "She smiles." }] })]);
    existingSession(h);
    h.state.rollAnswer = open();
    await play(h, { body: BODY });
    expect(rolls(h)).toEqual([{ type: "dm_roll", roll: shown }]);
    expect(savedResults(h)).toEqual([expect.objectContaining({ dmRoll: shown })]);
    // Nothing else of the tool's answer reaches the browser.
    expect(JSON.stringify(h.events)).not.toContain("ROLL-MESSAGE-ID");
  });

  it("puts the roll before the narration that says what came of it", async () => {
    const h = harness([
      rollStep(),
      (request) => {
        request.onText?.("She smiles.");
        return step(10, { blocks: [{ type: "text", text: "She smiles." }] });
      },
    ]);
    existingSession(h);
    h.state.rollAnswer = open();
    await play(h, { body: BODY });
    const kinds = h.events.map((e) => e.type);
    expect(kinds.indexOf("dm_roll")).toBeGreaterThan(-1);
    expect(kinds.indexOf("dm_roll")).toBeLessThan(kinds.lastIndexOf("text"));
  });

  it("sends and stores nothing for a hidden roll, not even that the Dungeon Master rolled in secret", async () => {
    const h = harness([rollStep(), step(10)]);
    existingSession(h);
    h.state.rollAnswer = open({ hidden: true });
    await play(h, { body: BODY });
    expect(rolls(h)).toEqual([]);
    expect(savedResults(h).some((b) => b.type === "tool_result" && b.dmRoll !== undefined)).toBe(false);
  });

  it("shows no roll when the tool failed, even if its error text happens to parse", async () => {
    const h = harness([rollStep(), step(10)]);
    existingSession(h);
    h.state.rollAnswer = { ...open(), isError: true };
    await play(h, { body: BODY });
    expect(rolls(h)).toEqual([]);
  });

  it("reads a roll only from the roll tool, so a looked-up note shaped like one is not drawn as dice", async () => {
    const h = harness([
      step(10, { blocks: [{ type: "tool_call", id: "s1", name: "search", input: { query: "x" } }], stop: "tool_calls" }),
      step(10),
    ]);
    existingSession(h);
    h.deps.tools = [...h.deps.tools, { name: "search", description: "search", inputSchema: {} }];
    h.deps.callTool = async () => open();
    await play(h, { body: BODY });
    expect(rolls(h)).toEqual([]);
  });

  it("shows the roll when narration is being checked too, the path every real turn takes", async () => {
    const h = harness([rollStep(), step(10)]);
    existingSession(h);
    h.state.rollAnswer = open();
    // Any judge at all switches the turn onto the queued path; this turn has no lines for it to judge.
    h.deps.judgeNarration = async () => ({ model: "jev-1", inputTokens: 1, answers: {} });
    await play(h, { body: BODY });
    expect(rolls(h)).toEqual([{ type: "dm_roll", roll: shown }]);
  });
});

describe("opening the scene", () => {
  const OPEN = { campaignId: CAMPAIGN, message: "", mode: "do", opening: true, startLocationId: CELLAR };
  const openingBlock = (h: Harness) => h.requests[0].messages[h.requests[0].messages.length - 1].blocks[0];

  it("lets a new sitting begin with the Dungeon Master, with no words of the player's on the page", async () => {
    const h = harness();
    expect(await play(h, { body: OPEN })).toBeNull();
    const block = openingBlock(h);
    expect(block.type === "text" && block.text).toContain("has just sat down");
    expect(block.type === "text" && block.player).toBeUndefined();
    expect(last(h)).toMatchObject({ type: "done" });
  });

  it("refuses an opening on a conversation that is already under way, or it would restart the scene mid-story", async () => {
    const h = harness();
    existingSession(h);
    expect((await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "", mode: "do", opening: true } }))?.status).toBe(400);
    expect(h.modelCalls()).toBe(0);
  });

  it("refuses an opening that carries words, and takes nothing but a literal true for one", async () => {
    const h = harness();
    expect((await play(h, { body: { ...OPEN, message: "I look around." } }))?.status).toBe(400);
    expect((await play(h, { body: { ...OPEN, opening: "yes" } }))?.status).toBe(400);
    expect((await play(h, { body: { ...OPEN, opening: false } }))?.status).toBe(400);
  });

  it("still refuses an empty message that is not an opening", async () => {
    const h = harness();
    expect((await play(h, { body: { campaignId: CAMPAIGN, message: "", mode: "do" } }))?.status).toBe(400);
  });
});

describe("what play reveals", () => {
  const wren = (): PlayerCharacter => ({
    id: WREN, name: "Wren Ashfield", pronouns: null, species: null, className: "Ranger", subclass: null, level: 3, hitPoints: null,
  });
  const BODY = { campaignId: CAMPAIGN, sessionId: SESSION, message: "Is the cellar safe?", mode: "say" };
  const speak = (): ModelStep =>
    step(100, {
      blocks: [{ type: "tool_call", id: "s1", name: "speak", input: { speaker_id: HONEYCOMB, happening: "A stranger asks about the cellar.", player_said: "Is the cellar safe?", present: [] } }],
      stop: "tool_calls",
    });
  const played = (script: Script, over: Partial<SessionRow> = {}): Harness => {
    const h = harness(script);
    h.state.characters.set(WREN, wren());
    existingSession(h, { party_member_id: WREN, scene_location_id: CELLAR, ...over });
    return h;
  };

  it("shows the played character the place they stand in and whoever spoke to them, once the turn is kept", async () => {
    const h = played([speak(), step(100, { blocks: [{ type: "text", text: "Well enough." }] }), step(10)]);
    await play(h, { body: BODY });
    expect(h.reveals).toEqual([{ campaignId: CAMPAIGN, memberId: WREN, locationId: CELLAR, characterIds: [HONEYCOMB] }]);
  });

  it("reveals nothing on a turn that is not kept, or a retried turn would have shown what never happened", async () => {
    const h = played([speak(), step(100, { blocks: [{ type: "text", text: "Well enough." }] }), step(10)]);
    h.state.conflict = true;
    await play(h, { body: BODY });
    expect(h.reveals).toEqual([]);
  });

  it("reveals nothing when nobody is played, since there is no character to show it to", async () => {
    const h = harness([step(10)]);
    existingSession(h, { scene_location_id: CELLAR });
    await play(h, { body: BODY });
    expect(h.reveals).toEqual([]);
  });

  it("reveals nothing for a party with no place when nobody spoke", async () => {
    const h = played([step(10)], { scene_location_id: null });
    await play(h, { body: BODY });
    expect(h.reveals).toEqual([]);
  });

  it("keeps the turn when the reveal cannot be written", async () => {
    const h = played([step(10)]);
    h.state.revealFails = true;
    await play(h, { body: BODY });
    expect(last(h)).toMatchObject({ type: "done" });
  });
});

describe("where a campaign begins", () => {
  const QUEST = "00000000-0000-4000-8000-000000000c01";
  const BEAT = "00000000-0000-4000-8000-000000000c02";
  const prologue = (over: Partial<Prologue> = {}): Prologue => ({ questId: QUEST, beatId: BEAT, beatTitle: "The offer", locationId: CELLAR, readAloud: "PROLOGUE-MARK There is a workshop on the eastern slope.", ...over });
  const OPEN = { campaignId: CAMPAIGN, message: "", mode: "do", opening: true };
  const opened = (h: Harness) => h.requests[0].messages[h.requests[0].messages.length - 1].blocks[0];

  it("begins the first sitting at the opening beat's place, with the quest in play before the narrator reads the quests", async () => {
    const h = harness();
    h.state.prologue = prologue();
    await play(h, { body: OPEN });
    expect([...h.sessions.values()][0].scene_location_id).toBe(CELLAR);
    expect(h.begun).toEqual([{ campaignId: CAMPAIGN, questId: QUEST, beatId: BEAT }]);
    expect(h.log.indexOf("prologue")).toBeLessThan(h.log.indexOf("model"));
  });

  it("hands the narrator the adventure's own opening words at the very start, and only then", async () => {
    const h = harness();
    h.state.prologue = prologue();
    await play(h, { body: OPEN });
    const first = opened(h);
    expect(first.type === "text" && first.text).toContain("PROLOGUE-MARK");
    // In place of the ordinary opening, not beside it: given both, the narrator left the author's words out.
    expect(first.type === "text" && first.text).not.toContain("two to four sentences");

    const later = harness();
    await play(later, { body: OPEN });
    const second = opened(later);
    expect(second.type === "text" && second.text).not.toContain("very beginning of the campaign");
  });

  it("leaves the read-aloud out when the player speaks first instead of asking for an opening", async () => {
    const h = harness();
    h.state.prologue = prologue();
    await play(h, { body: { campaignId: CAMPAIGN, message: "Hello?", mode: "say" } });
    const first = opened(h);
    expect(first.type === "text" && first.text).not.toContain("PROLOGUE-MARK");
    // The story still begins where the campaign says it does.
    expect([...h.sessions.values()][0].scene_location_id).toBe(CELLAR);
  });

  it("goes by the place the page named over the prologue's", async () => {
    const h = harness();
    h.state.prologue = prologue({ locationId: null });
    await play(h, { body: { ...OPEN, startLocationId: CELLAR } });
    expect([...h.sessions.values()][0].scene_location_id).toBe(CELLAR);
  });

  it("does not look for an opening on a conversation that is under way", async () => {
    const h = harness();
    existingSession(h);
    h.state.prologue = prologue();
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi", mode: "say" } });
    expect(h.begun).toEqual([]);
  });

  it("still begins the sitting when the campaign's opening cannot be read", async () => {
    const h = harness();
    h.state.prologueThrows = true;
    await play(h, { body: OPEN });
    expect(last(h)).toMatchObject({ type: "done" });
    expect(h.begun).toEqual([]);
  });
});

describe("the story turns into a fight", () => {
  const wren = (): PlayerCharacter => ({
    id: WREN, name: "Wren Ashfield", pronouns: null, species: null, className: "Ranger", subclass: null, level: 3, hitPoints: null,
  });
  const BODY = { campaignId: CAMPAIGN, sessionId: SESSION, message: "I draw my sword.", mode: "do" };
  const prepared: FightsInView = { prepared: [{ id: FIGHT, name: "The cellar rats", creatures: "3 Giant Rats" }], fight: null };
  const startStep = (): ModelStep =>
    step(10, { blocks: [{ type: "tool_call", id: "f1", name: "start_fight", input: { encounter_id: FIGHT } }], stop: "tool_calls" });
  const played = (script: Script, over: Partial<SessionRow> = {}): Harness => {
    const h = harness(script);
    h.state.characters.set(WREN, wren());
    existingSession(h, { party_member_id: WREN, scene_location_id: CELLAR, ...over });
    return h;
  };
  const fightEvents = (h: Harness) => h.events.filter((e) => e.type === "fight");

  it("shows the narrator the fights prepared where the party stands, read for this conversation's place and fight", async () => {
    const h = played([step(10)]);
    h.state.fights = prepared;
    await play(h, { body: BODY });
    expect(h.fightLoads).toEqual([{ campaignId: CAMPAIGN, locationId: CELLAR, fightEncounterId: null }]);
    expect(opening(h.requests[0])).toContain("The cellar rats");
    expect(h.requests[0].system).not.toContain("The cellar rats");
  });

  // Bug caught live (17 Nov 2026): a fight against a character with no stat block, who then stood on the map unable
  // to act while the player was asked to move them.
  it("starts no fight with a creature that has no stat block, and tells the narrator to play it out in the story", async () => {
    const h = played([startStep(), step(10)]);
    h.state.fights = prepared;
    h.state.statless = ["Sift"];
    await play(h, { body: BODY });
    expect(fightEvents(h)).toEqual([]);
    const told = JSON.stringify(h.requests[1]);
    expect(told).toContain("Sift has no stat block");
    expect(told).toContain("No fight was started");
  });

  // Bug caught live (17 Nov 2026): a sitting left holding a fight against a character with no stat block. Nothing in
  // it could act, yet every turn the narrator sent the player back to "the fight screen" and the story never went on.
  it("lets go of a fight that has not begun and cannot be fought, and plays the turn as story", async () => {
    const h = played([step(10, { blocks: [{ type: "text", text: "Sift waits for your answer." }] })], { fight_encounter_id: FIGHT });
    h.state.fights = { prepared: [], fight: { encounterId: FIGHT, name: "Rosie confronts Sift", phase: "waiting", round: null, fighters: [] } };
    h.state.statless = ["Sift"];
    await play(h, { body: BODY });
    expect(fightEvents(h)).toEqual([{ type: "fight", fight: null, calledOff: true }]);
    expect(opening(h.requests[0])).not.toContain("Rosie confronts Sift");
    expect(last(h)).toMatchObject({ type: "done" });
  });

  // Bug caught: a fight being fought right now dropped because someone in it has no stat block (a DM may be running them by hand).
  it("keeps a fight that is under way, whoever is in it", async () => {
    const h = played([step(10)], { fight_encounter_id: FIGHT });
    h.state.fights = { prepared: [], fight: { encounterId: FIGHT, name: "Rosie confronts Sift", phase: "running", round: 1, fighters: [] } };
    h.state.statless = ["Sift"];
    await play(h, { body: BODY });
    expect(fightEvents(h)).toEqual([]);
    expect(opening(h.requests[0])).toContain("Rosie confronts Sift");
  });

  // Bug caught live (17 Nov 2026): "i take the chair behind me and throw it at the dogs" was answered "Resolve the
  // fight on the fight screen". The Dungeon Master had no way to rule on what the rules have no button for.
  describe("the Dungeon Master's ruling in a fight on the board", () => {
    const running: FightsInView = {
      prepared: [],
      fight: { encounterId: FIGHT, name: "The Watching Pack", phase: "running", round: 2, fighters: [
        { name: "Wren Ashfield", side: "party", hp: 20, maxHp: 24 },
        { name: "Giant Rat 1", side: "enemy", hp: 5, maxHp: 7 },
      ] },
    };
    const change = (input: Record<string, unknown>): ModelStep =>
      step(10, { blocks: [{ type: "tool_call", id: "c1", name: "fight_change", input }], stop: "tool_calls" });
    const turn = { yours: true, action: true, bonus: true, reaction: true, words: true };
    // The attempt was asked for a turn ago (Strength (Athletics), DC 15) and this turn carries the player's roll.
    const pending = { label: "Strength (Athletics)", kind: "check", ability: "str", skill: "athletics", dc: 15 } as const;
    const inFight = (script: Script): Harness => {
      const h = played(script, { fight_encounter_id: FIGHT, pending_roll: pending });
      h.state.fights = running;
      return h;
    };
    // 13 + 4 = 17 meets DC 15; 5 + 4 = 9 does not.
    const rolling = (face: number, over: Record<string, unknown> = {}) => ({ ...BODY, message: "", roll: { faces: [face], mode: "normal", bonus: 4, atTable: true }, fightTurn: turn, ...over });

    it("offers the tool only while a fight is being fought, and tells the narrator what the turn holds", async () => {
      const h = inFight([step(10)]);
      await play(h, { body: { ...BODY, fightTurn: { ...turn, action: false } } });
      expect(h.requests[0].tools.map((t) => t.name)).toContain("fight_change");
      expect(opening(h.requests[0])).toContain("It still holds: Bonus Action, Reaction, a few words.");
      const quiet = played([step(10)]);
      quiet.state.fights = prepared;
      await play(quiet, { body: BODY });
      expect(quiet.requests[0].tools.map((t) => t.name)).not.toContain("fight_change");
    });

    it("hands the change to the page once the turn is kept", async () => {
      const h = inFight([change({ costs: "action", condition: { target: "Giant Rat 1", name: "Blinded" } }), step(10)]);
      await play(h, { body: rolling(13) });
      expect(h.events.filter((e) => e.type === "fight_change")).toEqual([
        { type: "fight_change", change: { costs: "action", condition: { target: "Giant Rat 1", name: "Blinded", rounds: 1 }, damage: null, ends: null } },
      ]);
    });

    // Bug caught: a fight the narrator ended ("he gives in") told a second time as an aftermath on the next message.
    it("lets go of the fight when the ruling ends it", async () => {
      const h = inFight([change({ costs: "action", ends: "they_give_in" }), step(10)]);
      await play(h, { body: rolling(13) });
      expect(h.fightSets).toEqual([{ sessionId: SESSION, campaignId: CAMPAIGN, encounterId: null }]);
      // And it goes on record, so the fight is part of the story so far.
      expect(h.facts.map((f) => f.body)).toContain('Wren Ashfield fought "The Watching Pack": Giant Rat 1 gave in.');
      expect(h.events.some((e) => e.type === "fact" && e.fact.body.includes("gave in"))).toBe(true);
    });

    // Bug caught: a stunt carried out for a player whose Action already went on an attack.
    it("changes nothing when the turn no longer holds what it costs", async () => {
      const h = inFight([change({ costs: "action", condition: { target: "Giant Rat 1", name: "Blinded" } }), step(10)]);
      await play(h, { body: rolling(13, { fightTurn: { ...turn, action: false } }) });
      expect(h.events.some((e) => e.type === "fight_change")).toBe(false);
      expect(JSON.stringify(h.requests[1])).toContain("already used their Action");
    });

    // Bug caught live (17 Nov 2026): a hound pinned with no roll at all. The narrator "applied the condition without
    // the required roll", in its own words.
    it("changes nothing on a turn that carries no roll of the player's", async () => {
      const h = inFight([change({ costs: "action", condition: { target: "Giant Rat 1", name: "Grappled" } }), step(10)]);
      await play(h, { body: { ...BODY, fightTurn: turn } });
      expect(h.events.some((e) => e.type === "fight_change")).toBe(false);
      expect(JSON.stringify(h.requests[1])).toContain("Nothing changes without the player's roll");
    });

    // Bug caught: a failed grapple that still pins, or a failed attempt that costs the turn nothing.
    it("does nothing to the creature when the roll failed, and still charges the turn", async () => {
      const h = inFight([change({ costs: "action", condition: { target: "Giant Rat 1", name: "Grappled" } }), step(10)]);
      await play(h, { body: rolling(5) });
      expect(h.events.filter((e) => e.type === "fight_change")).toEqual([
        { type: "fight_change", change: { costs: "action", condition: null, damage: null, ends: null } },
      ]);
    });

    // Bug caught live (17 Nov 2026): a roll asked for, made, and then refused because the Action was already spent.
    it("asks for no roll when the turn cannot pay for the attempt", async () => {
      const ask: ModelStep = step(10, { blocks: [{ type: "tool_call", id: "a1", name: "ask_roll", input: { kind: "check", skill: "persuasion", dc: 13 } }], stop: "tool_calls" });
      const h = played([ask, step(10)], { fight_encounter_id: FIGHT });
      h.state.fights = running;
      await play(h, { body: { ...BODY, fightTurn: { ...turn, action: false, bonus: false } } });
      expect(h.events.some((e) => e.type === "ask_roll")).toBe(false);
      expect(JSON.stringify(h.requests[1])).toContain("Ask for no roll");
    });

    // Bug caught: the board changed for a turn the player never got to keep.
    it("changes nothing when the turn is not kept", async () => {
      const h = inFight([change({ costs: "action", condition: { target: "Giant Rat 1", name: "Blinded" } }), step(10)]);
      h.state.saveThrows = true;
      await play(h, { body: rolling(13) });
      expect(h.events.some((e) => e.type === "fight_change")).toBe(false);
    });
  });

  it("starts the fight once the turn is kept, as the played character, and tells the page where it is", async () => {
    const h = played([startStep(), step(10)]);
    h.state.fights = prepared;
    await play(h, { body: BODY });
    expect(h.startedFights).toEqual([
      { ctx: { campaignId: CAMPAIGN, sessionId: SESSION, userId: DM, memberId: WREN, locationId: CELLAR, playSessionId: null }, plan: { kind: "prepared", encounterId: FIGHT, name: "The cellar rats" } },
    ]);
    expect(fightEvents(h)).toEqual([{ type: "fight", fight: { encounterId: FIGHT, name: "The cellar rats" } }]);
  });

  it("starts no fight on a turn that is not kept", async () => {
    const h = played([startStep(), step(10)]);
    h.state.fights = prepared;
    h.state.conflict = true;
    await play(h, { body: BODY });
    expect(h.startedFights).toEqual([]);
    expect(fightEvents(h)).toEqual([]);
  });

  it("does not send the player to a fight that could not be started", async () => {
    const h = played([startStep(), step(10)]);
    h.state.fights = prepared;
    h.state.startFightFails = true;
    await play(h, { body: BODY });
    expect(fightEvents(h)).toEqual([]);
    expect(last(h)).toMatchObject({ type: "done" });
  });

  it("offers no fight tool when nobody is played or the fights cannot be read", async () => {
    const nobody = harness();
    existingSession(nobody, { scene_location_id: CELLAR });
    nobody.state.fights = prepared;
    await play(nobody, { body: BODY });
    expect(nobody.requests[0].tools.map((t) => t.name)).not.toContain("start_fight");

    const unreadable = played([step(10)]);
    unreadable.state.fightsThrow = true;
    await play(unreadable, { body: BODY });
    expect(unreadable.requests[0].tools.map((t) => t.name)).not.toContain("start_fight");
    expect(last(unreadable)).toMatchObject({ type: "done" });

    const ready = played([step(10)]);
    await play(ready, { body: BODY });
    expect(ready.requests[0].tools.map((t) => t.name)).toContain("start_fight");
  });

  it("lets go of a fight once the narrator has been told it is over, and tells the page", async () => {
    const h = played([step(10)], { fight_encounter_id: FIGHT });
    h.state.fights = { prepared: [], fight: { encounterId: FIGHT, name: "The cellar rats", phase: "over", round: 3, fighters: [] } };
    await play(h, { body: BODY });
    expect(h.fightSets).toEqual([{ sessionId: SESSION, campaignId: CAMPAIGN, encounterId: null }]);
    expect(fightEvents(h)).toEqual([{ type: "fight", fight: null }]);
  });

  it("keeps hold of a fight that is still being fought", async () => {
    const h = played([step(10)], { fight_encounter_id: FIGHT });
    h.state.fights = { prepared: [], fight: { encounterId: FIGHT, name: "The cellar rats", phase: "running", round: 2, fighters: [] } };
    await play(h, { body: BODY });
    expect(h.fightSets).toEqual([]);
    expect(fightEvents(h)).toEqual([]);
  });

  it("does not let go of a fight on a turn that was not kept, so its aftermath is still told", async () => {
    const h = played([step(10)], { fight_encounter_id: FIGHT });
    h.state.fights = { prepared: [], fight: { encounterId: FIGHT, name: "The cellar rats", phase: "over", round: 3, fighters: [] } };
    h.state.conflict = true;
    await play(h, { body: BODY });
    expect(h.fightSets).toEqual([]);
  });
});
