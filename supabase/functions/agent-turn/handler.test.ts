/**
 * The handler against an in-memory store with the database's own rules: `appendTurns` writes only when the caller's
 * last seq still matches, answers with the whole credits the conversation's running total newly crossed (floor of the
 * new total minus floor of the old), `saveSummary` refuses when the summary it expected is no longer the stored one,
 * and every reservation must be released. The model is scripted. Expected credits are worked
 * out from the price and calibration below: input is free and output costs 10 USD per million tokens, a credit is
 * worth 0.01 USD at margin 1, so 600 output tokens are 0.006 USD, which is 0.6 credits.
 */
import { describe, expect, it } from "vitest";
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
import { AgentProviderError, type AgentBlock, type CallModel, type ModelRequest, type ModelStep } from "../_shared/agent/types";
import type { StoredTurn, TurnRow } from "../_shared/agent/transcript";
import type { CreditLogFields } from "../_shared/credits";

const DM = "00000000-0000-4000-8000-0000000000d1";
const OTHER = "00000000-0000-4000-8000-0000000000e2";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const HONEYCOMB = "00000000-0000-4000-8000-0000000000f1";
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
  };
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
    },
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
    createSession: async ({ userId, campaignId }) => {
      const row: SessionRow = {
        id: "00000000-0000-4000-8000-0000000000b9",
        user_id: userId,
        campaign_id: campaignId,
        summary: null,
        summary_through_seq: 0,
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
    callTool: async () => ({ content: "RESULT-SECRET: the duke is the lich", isError: false }),
    loadSpeaker: async (campaignId, characterId) => {
      speakerLoads.push({ campaignId, characterId });
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

  it("tells the narrator a deed was not said aloud, so nobody answers words that were never spoken", async () => {
    const say = harness();
    await play(say, { body: { campaignId: CAMPAIGN, message: "Open up!", mode: "say" } });
    const done = harness();
    await play(done, { body: { campaignId: CAMPAIGN, message: "Open up!", mode: "do" } });
    const read = (h: Harness) => {
      const b = h.requests[0].messages[0].blocks[0];
      return b.type === "text" ? b.text : "";
    };
    expect(read(say)).toContain("says aloud");
    expect(read(done)).toContain("nothing is said aloud");
    expect(read(say)).not.toBe(read(done));
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

  it("sends the browser the line, and still nothing of what the narrator put into the tool", async () => {
    const h = harness(script());
    await play(h);
    expect(h.events).toContainEqual({
      type: "line",
      line: { kind: "spoken", speaker: { id: HONEYCOMB, name: "Honeycomb" }, text: "Honeycomb. Apprentice, once." },
    });
    const sent = JSON.stringify(h.events);
    expect(sent).not.toContain("A stranger asks who you are.");
    expect(sent).not.toContain("HONEYCOMB-SECRET");
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
