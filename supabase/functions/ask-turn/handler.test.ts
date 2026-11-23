/**
 * The Ask handler against an in-memory store with the database's own rules: `appendTurns` writes only when the
 * caller's last seq still matches; `chargeAnswer` is the allowance (five free a day, then the exact credits). The model
 * is scripted. Credits are worked out from the price below: output costs 10 USD per million tokens and a credit is
 * worth 0.01 USD at margin 1, so 600 output tokens are 0.006 USD, which is 0.6 credits.
 */
import { describe, expect, it, vi } from "vitest";
import type { AskEvent } from "../_shared/agent/askContract.ts";
import { ASK_MESSAGES, type AskSessionRow, type AskTurnDeps } from "../_shared/agent/askTypes.ts";
import type { JobLedger } from "../_shared/pipeline/creditHold.ts";
import type { TurnRow } from "../_shared/agent/transcript.ts";
import type { AgentBlock, CallModel, ModelRequest, ModelStep } from "../_shared/agent/types.ts";
import { beginAsk, handleAskTurn } from "./handler.ts";

const DM = "00000000-0000-4000-8000-0000000000d1";
const OTHER = "00000000-0000-4000-8000-0000000000e2";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const NPC = "00000000-0000-4000-8000-0000000000f1";
const TODAY = "2026-11-23";

const usage = (outputTokens: number) => ({ provider: "openai", model: "m1", inputTokens: 0, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 });
const say = (text: string, outputTokens = 600): ModelStep => ({ blocks: [{ type: "text", text }], stop: "end", usage: usage(outputTokens) });
const call = (id: string, name: string, input: Record<string, unknown>, outputTokens = 100): ModelStep => ({
  blocks: [{ type: "tool_call", id, name, input }], stop: "tool_calls", usage: usage(outputTokens),
});

interface Harness {
  deps: AskTurnDeps;
  events: AskEvent[];
  requests: ModelRequest[];
  steps: ModelStep[];
  sessions: Map<string, AskSessionRow>;
  turns: Array<{ session_id: string; seq: number; role: string; blocks: AgentBlock[] }>;
  usage: { day: string; free_used: number } | null;
  charges: number[];
  ledger: Array<{ kind: "charge" | "free"; reason: string; cost?: number; isByok?: boolean }>;
  holds: number[];
  held: { refuse: boolean };
  appends: number;
  records: Map<string, string>;
  byok: boolean;
  summaries: number;
}

function harness(): Harness {
  const h: Harness = {
    deps: undefined as unknown as AskTurnDeps, events: [], requests: [], steps: [], sessions: new Map(), turns: [], usage: null,
    charges: [], ledger: [], holds: [], held: { refuse: false }, appends: 0, records: new Map(), byok: false, summaries: 0,
  };
  const callModel: CallModel = async (request) => {
    h.requests.push(request);
    const step = h.steps.shift();
    if (!step) throw new Error("the model was called more often than the test scripted");
    for (const b of step.blocks) if (b.type === "text") request.onText?.(b.text);
    return step;
  };
  const ledger: JobLedger = {
    charge: (reason, line) => { h.ledger.push({ kind: "charge", reason, cost: line.cost, isByok: line.isByok }); },
    free: (reason) => { h.ledger.push({ kind: "free", reason }); },
  };
  h.deps = {
    accountRefusal: async () => null,
    loadCampaign: async (id) => (id === CAMPAIGN ? { id: CAMPAIGN, user_id: DM, name: "Kind Country", game_system: "dnd5e-2024", ai_enabled: true } : null),
    isDm: async (_c, userId) => userId === DM,
    loadSession: async (id) => { const s = h.sessions.get(id); return s ? { ...s } : null; },
    rateLimit: async () => true,
    resolveProvider: async () => ({ provider: "openai", model: "m1", isByok: h.byok, callModel }),
    loadPrice: async () => ({ inputPerMillion: 0, outputPerMillion: 10, cachedInputPerMillion: null }),
    loadCalibration: async () => ({ usdPerCredit: 0.01, margin: 1 }),
    isFlagged: async () => false,
    today: () => TODAY,
    loadUsage: async () => h.usage,
    createSession: async ({ userId, campaignId }) => {
      const row: AskSessionRow = { id: SESSION, user_id: userId, campaign_id: campaignId, kind: "ask", summary: null, summary_through_seq: 0 };
      h.sessions.set(row.id, row);
      return { ...row };
    },
    loadTurns: async (id) => h.turns.filter((t) => t.session_id === id).map((t) => ({ seq: t.seq, role: t.role as "user" | "assistant", blocks: t.blocks })),
    withHold: async (_userId, credits, work) => {
      h.holds.push(credits);
      if (h.held.refuse) return new Response(JSON.stringify({ error: "insufficient_credits", balance: 0 }), { status: 402 });
      return work({ handOff: () => ["hold-1"] });
    },
    settle: async (_u, _ids, work) => { await work(ledger); },
    appendTurns: async (sessionId, afterSeq, rows: TurnRow[]) => {
      const last = h.turns.filter((t) => t.session_id === sessionId).reduce((m, t) => Math.max(m, t.seq), 0);
      if (last !== afterSeq) return "conflict";
      h.appends++;
      for (const r of rows) h.turns.push({ session_id: sessionId, seq: r.seq, role: r.role, blocks: r.blocks });
      return { due: 7 };
    },
    saveSummary: async () => { h.summaries++; return { due: 5 }; },
    chargeAnswer: async (_u, credits) => {
      h.charges.push(credits);
      const day = h.usage?.day === TODAY ? h.usage.free_used : 0;
      if (day < 5) { h.usage = { day: TODAY, free_used: day + 1 }; return { free: true, credits: 0, freeLeft: 4 - day }; }
      return { free: false, credits: Math.floor(credits), freeLeft: 0 };
    },
    mcpTools: ["search", "get", "list", "campaign_overview"].map((name) => ({ name, description: name, inputSchema: {} })),
    callMcp: () => async (name) => ({ content: JSON.stringify(name === "search" ? { hits: [{ type: "npc", id: NPC, name: "Harl" }] } : {}), isError: false }),
    find: async () => [],
    loadRecord: async (campaignId, _type, id) => (campaignId === CAMPAIGN && h.records.has(id) ? { name: h.records.get(id)! } : null),
    newId: () => "proposal-1",
  };
  return h;
}

async function ask(h: Harness, over: { body?: unknown; userId?: string; signal?: AbortSignal } = {}) {
  return handleAskTurn({
    userId: over.userId ?? DM,
    body: over.body ?? { campaignId: CAMPAIGN, message: "Who runs the mill?" },
    deps: h.deps,
    send: (e) => h.events.push(e),
    signal: over.signal,
  });
}
const types = (h: Harness) => h.events.map((e) => e.type);
const done = (h: Harness) => h.events.find((e) => e.type === "done") as Extract<AskEvent, { type: "done" }>;

describe("the gates", () => {
  it("refuses a body that is not a question, before anything is read", async () => {
    const h = harness();
    expect(await ask(h, { body: { campaignId: CAMPAIGN } })).toEqual({ status: 400, error: ASK_MESSAGES.badBody });
    expect(h.requests).toEqual([]);
  });

  it("refuses a caller who is not the campaign's DM, and a campaign that does not exist", async () => {
    const h = harness();
    expect(await ask(h, { userId: OTHER })).toEqual({ status: 403, error: ASK_MESSAGES.forbidden });
    expect(await ask(h, { body: { campaignId: "00000000-0000-4000-8000-0000000000c9", message: "x" } })).toEqual({ status: 404, error: ASK_MESSAGES.noCampaign });
  });

  it("refuses a campaign with AI off", async () => {
    const h = harness();
    h.deps.loadCampaign = async () => ({ id: CAMPAIGN, user_id: DM, name: "c", game_system: null, ai_enabled: false });
    expect(await ask(h)).toEqual({ status: 403, error: ASK_MESSAGES.aiOff });
  });

  it("refuses a conversation the table opened as not found: Ask continues only its own kind", async () => {
    const h = harness();
    h.sessions.set(SESSION, { id: SESSION, user_id: DM, campaign_id: CAMPAIGN, kind: "solo_table", summary: null, summary_through_seq: 0 });
    expect(await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi" } })).toEqual({ status: 404, error: ASK_MESSAGES.notFound });
    expect(h.requests).toEqual([]);
  });

  it("refuses another account's Ask conversation as not found", async () => {
    const h = harness();
    h.sessions.set(SESSION, { id: SESSION, user_id: OTHER, campaign_id: CAMPAIGN, kind: "ask", summary: null, summary_through_seq: 0 });
    expect(await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "hi" } })).toEqual({ status: 404, error: ASK_MESSAGES.notFound });
  });

  it("refuses when the day's usage cannot be read, rather than answering for nothing", async () => {
    const h = harness();
    h.deps.loadUsage = async () => { throw new Error("db"); };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await ask(h)).toEqual({ status: 503, error: ASK_MESSAGES.noMetering });
    quiet.mockRestore();
  });
});

describe("an answer", () => {
  it("opens the conversation, streams the text, saves the rows and counts a free answer", async () => {
    const h = harness();
    h.steps.push(say("Harl runs it."));
    expect(await ask(h)).toBeNull();
    expect(types(h)).toEqual(["session", "text", "done"]);
    expect(h.events[0]).toEqual({ type: "session", sessionId: SESSION });
    expect(h.sessions.get(SESSION)?.kind).toBe("ask");
    expect(h.turns.map((t) => [t.seq, t.role])).toEqual([[1, "user"], [2, "assistant"]]);
    // 600 output tokens at 10 USD per million, 0.01 USD a credit: 0.6 credits, measured exactly.
    expect(h.charges).toEqual([0.6]);
    expect(done(h)).toEqual({ type: "done", end: "done", routed: false, free: true, credits: 0, freeLeft: 4 });
    expect(h.ledger[0]).toEqual({ kind: "charge", reason: "ask_answer", cost: 0, isByok: false });
  });

  it("charges the whole credits `charge_ask_answer` says once the day's free answers are spent, and holds one credit first", async () => {
    const h = harness();
    h.usage = { day: TODAY, free_used: 5 };
    h.steps.push(say("Harl runs it.", 5000));
    expect(await ask(h)).toBeNull();
    expect(h.holds).toEqual([1]);
    expect(h.charges).toEqual([5]);
    expect(h.ledger.find((l) => l.reason === "ask_answer")).toMatchObject({ cost: 5 });
    expect(done(h)).toMatchObject({ routed: false, free: false, credits: 5, freeLeft: 0 });
  });

  it("holds nothing while a free answer is left", async () => {
    const h = harness();
    h.usage = { day: TODAY, free_used: 4 };
    h.steps.push(say("x"));
    await ask(h);
    expect(h.holds).toEqual([0]);
  });

  it("refuses with 402 ask_allowance_spent, before any model call, when no free answer is left and a credit cannot be held", async () => {
    const h = harness();
    h.usage = { day: TODAY, free_used: 5 };
    h.held.refuse = true;
    expect(await ask(h)).toEqual({ status: 402, error: "ask_allowance_spent" });
    expect(h.requests).toEqual([]);
    expect(h.events).toEqual([]);
    expect(h.sessions.size).toBe(0);
  });

  it("does not meter, charge or count an own-key answer, and looks up neither price nor usage", async () => {
    const h = harness();
    h.byok = true;
    h.usage = { day: TODAY, free_used: 5 };
    const price = vi.fn(h.deps.loadPrice);
    h.deps.loadPrice = price;
    h.steps.push(say("x"));
    await ask(h);
    expect(price).not.toHaveBeenCalled();
    expect(h.holds).toEqual([0]);
    expect(h.charges).toEqual([]);
    expect(h.ledger).toEqual([{ kind: "charge", reason: "ask_answer", cost: 0, isByok: true }]);
  });

  it("continues its own conversation: history is sent, and the standing instructions stay byte-identical", async () => {
    const h = harness();
    h.steps.push(say("Harl runs it."), say("Mara bakes."));
    await ask(h);
    await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "And the bakery?" } });
    expect(h.requests[1].system).toBe(h.requests[0].system);
    expect(h.requests[1].messages).toHaveLength(3);
    expect(h.turns.map((t) => t.seq)).toEqual([1, 2, 3, 4]);
  });

  it("puts where the DM is in the newest message, never the instructions, and names only a record of this campaign", async () => {
    const h = harness();
    h.records.set(NPC, "Harl");
    h.steps.push(say("x"));
    await ask(h, { body: { campaignId: CAMPAIGN, message: "who is this?", context: { route: "/npcs/x", record: { type: "npc", id: NPC } } } });
    expect(h.requests[0].system).not.toContain("Harl");
    const newest = h.requests[0].messages.at(-1)!.blocks[0] as { text: string };
    expect(newest.text).toContain("Harl");
  });

  it("ignores a context record that is not the campaign's: it is never read or named", async () => {
    const h = harness();
    h.steps.push(say("x"));
    const loadRecord = vi.spyOn(h.deps, "loadRecord");
    await ask(h, { body: { campaignId: CAMPAIGN, message: "who is this?", context: { route: "/npcs/x", record: { type: "npc", id: NPC } } } });
    expect(loadRecord).toHaveBeenCalledWith(CAMPAIGN, "npc", NPC);
    expect(JSON.stringify(h.requests[0].messages)).not.toContain(NPC);
  });

  it("tells the browser what an answer read, by name", async () => {
    const h = harness();
    h.steps.push(call("c1", "search", { query: "harl" }), say("Harl runs it."));
    await ask(h);
    expect(h.events).toContainEqual({ type: "read", records: [{ type: "npc", id: NPC, name: "Harl" }] });
  });
});

describe("a proposal", () => {
  it("is routed: not charged, not counted, and its cost is written as a free routing line", async () => {
    const h = harness();
    h.usage = { day: TODAY, free_used: 5 };
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a baker who lies" }));
    expect(await ask(h)).toBeNull();
    expect(h.charges).toEqual([]);
    expect(h.ledger).toEqual([{ kind: "charge", reason: "ask_routing", cost: 0, isByok: false }]);
    expect(done(h)).toMatchObject({ routed: true, credits: 0 });
    expect(types(h)).toContain("propose");
  });

  it("ends the turn with no further model call: the proposal stands for itself", async () => {
    const h = harness();
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a" }));
    await ask(h);
    expect(h.requests).toHaveLength(1);
  });

  it("is stored whole, so the next turn can continue the conversation", async () => {
    const h = harness();
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a" }));
    await ask(h);
    expect(h.turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(h.turns[2].blocks[0]).toMatchObject({ type: "tool_result", callId: "c1" });
  });
});

describe("a question", () => {
  it("emits the question with its chips, ends the turn, and counts as an answer", async () => {
    const h = harness();
    h.steps.push(call("c1", "ask_choice", { question: "Which Harl?", choices: [{ label: "The miller", reply: "the miller" }, { label: "The smith", reply: "the smith" }] }));
    await ask(h);
    expect(types(h)).toContain("ask");
    expect(h.requests).toHaveLength(1);
    expect(done(h)).toMatchObject({ routed: false });
    expect(h.charges).toHaveLength(1);
  });
});

describe("a turn that is not kept", () => {
  it("takes no free answer and charges nothing when the conversation moved on, and says so", async () => {
    const h = harness();
    h.steps.push(say("x"));
    h.deps.appendTurns = async () => "conflict";
    await ask(h);
    expect(h.charges).toEqual([]);
    expect(types(h)).toContain("error");
    expect(types(h)).not.toContain("done");
    expect(h.ledger).toEqual([{ kind: "charge", reason: "ask_answer", cost: 0, isByok: false }]);
  });

  it("answers with a sentence of ours when the provider fails, charging nothing", async () => {
    const h = harness();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await ask(h); // no scripted step: the model throws
    quiet.mockRestore();
    expect(h.events.at(-1)).toEqual({ type: "error", message: ASK_MESSAGES.failed });
    expect(h.charges).toEqual([]);
  });

  it("counts nothing when the DM stopped it before the first model call", async () => {
    const h = harness();
    const controller = new AbortController();
    controller.abort();
    await ask(h, { signal: controller.signal });
    expect(done(h)).toMatchObject({ end: "aborted", credits: 0 });
    expect(h.charges).toEqual([]);
    expect(h.appends).toBe(0);
  });
});

describe("beginAsk", () => {
  it("reserves nothing for a free answer and one credit for a charged one, as the hold's amount", async () => {
    const h = harness();
    expect(await beginAsk({ userId: DM, body: { campaignId: CAMPAIGN, message: "x" }, deps: h.deps })).toMatchObject({ kind: "ready", reserve: 0 });
    h.usage = { day: TODAY, free_used: 5 };
    expect(await beginAsk({ userId: DM, body: { campaignId: CAMPAIGN, message: "x" }, deps: h.deps })).toMatchObject({ kind: "ready", reserve: 1 });
  });

  it("gives the allowance back at midnight UTC: a count from yesterday is not today's", async () => {
    const h = harness();
    h.usage = { day: "2026-11-22", free_used: 5 };
    expect(await beginAsk({ userId: DM, body: { campaignId: CAMPAIGN, message: "x" }, deps: h.deps })).toMatchObject({ reserve: 0 });
  });
});
