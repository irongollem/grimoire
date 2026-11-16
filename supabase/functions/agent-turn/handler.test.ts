/**
 * The handler against an in-memory store with the database's own rules: `appendTurns` writes only when the caller's
 * last seq still matches, and every reservation must be released. The model is scripted. Expected credits are worked
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
      account: null,
    },
    deps: undefined as unknown as AgentTurnDeps,
  };
  h.deps = {
    accountRefusal: async () => h.state.account,
    loadCampaign: async () => h.state.campaign,
    isDm: async () => h.state.isDm,
    loadSession: async (id) => h.sessions.get(id) ?? null,
    createSession: async ({ userId, campaignId }) => {
      const row: SessionRow = {
        id: "00000000-0000-4000-8000-0000000000b9",
        user_id: userId,
        campaign_id: campaignId,
        summary: null,
        summary_through_seq: 0,
        credits_spent: 0,
      };
      h.sessions.set(row.id, row);
      log.push("create");
      return row;
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
      const session = h.sessions.get(sessionId)!;
      const last = h.turns.reduce((max, t) => Math.max(max, t.seq), 0);
      if (h.state.conflict || last !== afterSeq) return "conflict";
      h.appends.push({ afterSeq, rows, credits });
      for (const r of rows) h.turns.push({ seq: r.seq, role: r.role, blocks: r.blocks });
      session.credits_spent += credits;
      return "saved";
    },
    tools: [{ name: "roll", description: "roll", inputSchema: {} }],
    callTool: async () => ({ content: "RESULT-SECRET: the duke is the lich", isError: false }),
  };
  return h;
}

function existingSession(h: Harness, over: Partial<SessionRow> = {}): SessionRow {
  const row: SessionRow = {
    id: SESSION,
    user_id: DM,
    campaign_id: CAMPAIGN,
    summary: null,
    summary_through_seq: 0,
    credits_spent: 0,
    ...over,
  };
  h.sessions.set(row.id, row);
  return row;
}

async function play(h: Harness, over: { body?: unknown; userId?: string; signal?: AbortSignal } = {}) {
  const refusal = await handleAgentTurn({
    userId: over.userId ?? DM,
    body: over.body ?? { campaignId: CAMPAIGN, message: "I open the door." },
    deps: h.deps,
    send: (e) => h.events.push(e),
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
    const refusal = await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi" } });
    expect(refusal).toEqual({ status: 404, error: MESSAGES.notFound });
    expect(h.modelCalls()).toBe(0);
    expect(h.reserved).toEqual([]);
  });

  it("answers 404 for the caller's own conversation in another campaign", async () => {
    const h = harness();
    existingSession(h, { campaign_id: OTHER_CAMPAIGN });
    const refusal = await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi" } });
    expect(refusal?.status).toBe(404);
    expect(h.modelCalls()).toBe(0);
  });

  it("answers 404 for a conversation that does not exist", async () => {
    const h = harness();
    const refusal = await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi" } });
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
    ["no campaign", { message: "hi" }],
    ["campaign not a uuid", { campaignId: "x", message: "hi" }],
    ["session not a uuid", { campaignId: CAMPAIGN, sessionId: "x", message: "hi" }],
    ["empty after trimming", { campaignId: CAMPAIGN, message: "   " }],
    ["too long", { campaignId: CAMPAIGN, message: "a".repeat(4001) }],
    ["message not a string", { campaignId: CAMPAIGN, message: 4 }],
  ])("answers 400 for a body that is %s", async (_name, body) => {
    const h = harness();
    expect((await play(h, { body }))?.status).toBe(400);
    expect(h.modelCalls()).toBe(0);
  });

  it("trims the message and accepts exactly 4000 characters", async () => {
    const h = harness();
    expect(await play(h, { body: { campaignId: CAMPAIGN, message: `  ${"a".repeat(4000)}  ` } })).toBeNull();
    const first = h.requests[0].messages[0].blocks[0];
    expect(first).toEqual({ type: "text", text: "a".repeat(4000) });
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
    existingSession(h, { credits_spent: 0.5 });
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go" } });
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
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go" } });
    expect(h.appends[0].afterSeq).toBe(2);
    expect(h.appends[0].rows.map((r) => r.seq)).toEqual([3, 4]);
    // the model saw the stored history before the new message
    expect(h.requests[0].messages).toHaveLength(3);
  });

  it("answers a save conflict with the reload sentence, charges nothing, and logs the tokens at zero", async () => {
    const h = harness([step(600)]);
    existingSession(h, { credits_spent: 0.5 });
    h.state.conflict = true;
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go" } });
    expect(last(h)).toEqual({ type: "error", message: MESSAGES.conflict });
    expect(MESSAGES.conflict).toBe(
      "This conversation was continued somewhere else. Reload it and send your message again.",
    );
    expect(h.ledger).toEqual([{ kind: "free", cost: 0, log: expect.objectContaining({ output_tokens: 600 }) }]);
    expect(h.ledger.some((l) => l.kind === "spend")).toBe(false);
  });

  it("charges nothing when the save fails for another reason", async () => {
    const h = harness([step(600)]);
    existingSession(h, { credits_spent: 0.5 });
    h.state.saveThrows = true;
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go" } });
    expect(last(h)).toEqual({ type: "error", message: MESSAGES.notSaved });
    expect(h.ledger.some((l) => l.kind === "spend")).toBe(false);
  });

  it("saves first and charges after", async () => {
    const h = harness([step(600)]);
    existingSession(h, { credits_spent: 0.5 });
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go" } });
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
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go" } });
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
      body: { campaignId: CAMPAIGN, message: "go" },
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
    existingSession(h, { credits_spent: 0.5 });
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go" }, signal: controller.signal });
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
    await play(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "go" } });
    expect(h.requests[0].system).toContain("## The story so far\n\nThe party fled the mine.");
  });
});

describe("beginTurn", () => {
  it("returns a refusal as a value and has streamed nothing", async () => {
    const h = harness();
    h.state.isDm = false;
    const begun = await beginTurn({ userId: OTHER, body: { campaignId: CAMPAIGN, message: "hi" }, deps: h.deps });
    expect(begun).toEqual({ kind: "refused", refusal: { status: 403, error: MESSAGES.forbidden } });
    expect(h.events).toEqual([]);
  });
});
