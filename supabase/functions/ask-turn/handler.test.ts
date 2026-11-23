/**
 * The Ask handler against an in-memory store with the database's own rules: `appendTurns` writes only when the
 * caller's last seq still matches; `chargeAnswer` is the allowance (five free a day, then the exact credits). The model
 * is scripted. Credits are worked out from the price below: output costs 10 USD per million tokens and a credit is
 * worth 0.01 USD at margin 1, so 600 output tokens are 0.006 USD, which is 0.6 credits.
 */
import { describe, expect, it, vi } from "vitest";
import { ASK_OFF_TOPIC_MESSAGE, type AskEvent } from "../_shared/agent/askContract.ts";
import { ASK_MESSAGES, type AskSessionRow, type AskTurnDeps } from "../_shared/agent/askTypes.ts";
import type { JudgeRequest } from "../_shared/typesafe.ts";
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
  ledger: Array<{ kind: "charge" | "free"; reason: string; cost?: number; isByok?: boolean; tokens?: number }>;
  holds: number[];
  held: { refuse: boolean };
  appends: number;
  records: Map<string, string>;
  /** What `recordManualGap` was given: the question and the pages, and nothing else. */
  gaps: Array<{ question: string; pages: string[] }>;
  /** Routed turns written and not yet settled, as `ask_pending_routes` holds them. */
  pending: Array<{ proposalId: string; sessionId: string; credits: number }>;
  /** Generations the DM ran since the routes were written: each confirms one route, as the ledger does. */
  generations: number;
  settleCalls: number;
  /** What the scope judge is asked and what it answers: a probability of "in scope", null for no key, or a throw. */
  scope: { asked: JudgeRequest[]; answer: number | null | "throws"; report: { app_report: number; is_bug: number } | null };
  settleFails: boolean;
  byok: boolean;
  summaries: number;
}

function harness(): Harness {
  const h: Harness = {
    deps: undefined as unknown as AskTurnDeps, events: [], requests: [], steps: [], sessions: new Map(), turns: [], usage: null,
    charges: [], ledger: [], holds: [], held: { refuse: false }, appends: 0, records: new Map(), gaps: [], pending: [], generations: 0, settleCalls: 0, scope: { asked: [], answer: 1, report: null }, settleFails: false, byok: false, summaries: 0,
  };
  const callModel: CallModel = async (request) => {
    h.requests.push(request);
    const step = h.steps.shift();
    if (!step) throw new Error("the model was called more often than the test scripted");
    for (const b of step.blocks) if (b.type === "text") request.onText?.(b.text);
    return step;
  };
  // `charge_ask_answer`: five free a day, then the whole credits.
  const meter = (credits: number) => {
    const day = h.usage?.day === TODAY ? h.usage.free_used : 0;
    if (day < 5) { h.usage = { day: TODAY, free_used: day + 1 }; return { free: true, credits: 0, freeLeft: 4 - day }; }
    return { free: false, credits: Math.floor(credits), freeLeft: 0 };
  };
  const ledger: JobLedger = {
    charge: (reason, line) => { h.ledger.push({ kind: "charge", reason, cost: line.cost, isByok: line.isByok }); },
    free: (reason, log) => { h.ledger.push({ kind: "free", reason, tokens: log?.output_tokens }); },
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
    judgeScope: async (request) => {
      h.scope.asked.push(request);
      if (h.scope.answer === "throws") throw new Error("timeout");
      if (h.scope.answer === null) return null;
      return {
        model: "jev-1", inputTokens: 10, answers: {
        in_scope: { type: "noul", noul: h.scope.answer },
        ...(h.scope.report ? { app_report: { type: "noul", noul: h.scope.report.app_report }, is_bug: { type: "noul", noul: h.scope.report.is_bug } } : {}),
      },
    };
    },
    settleRoutes: async () => {
      h.settleCalls++;
      if (h.settleFails) throw new Error("db");
      let credits = 0;
      for (const route of h.pending.splice(0)) {
        if (h.generations > 0) { h.generations--; continue; }
        credits += meter(route.credits).credits;
      }
      return { credits, freeLeft: h.usage?.day === TODAY ? Math.max(0, 5 - h.usage.free_used) : 5 };
    },
    recordRoute: async (_u, route) => { h.pending.push(route); },
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
    chargeAnswer: async (_u, credits) => { h.charges.push(credits); return meter(credits); },
    mcpTools: ["search", "get", "list", "campaign_overview"].map((name) => ({ name, description: name, inputSchema: {} })),
    callMcp: () => async (name) => ({ content: JSON.stringify(name === "search" ? { hits: [{ type: "npc", id: NPC, name: "Harl" }] } : {}), isError: false }),
    find: async () => [],
    loadRecord: async (campaign, _type, id) => (campaign.id === CAMPAIGN && h.records.has(id) ? { name: h.records.get(id)! } : null),
    newId: () => "proposal-1",
    recordManualGap: async (question, pages) => { h.gaps.push({ question, pages }); },
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
});

describe("the scope check", () => {
  // Bug caught: an off-topic message reaching the model, taking a hold, settling earlier routes or opening a session.
  it("refuses an off-topic message with 422 ask_off_topic before the hold, the settlement and the model, costing nothing", async () => {
    const h = harness();
    h.scope.answer = 0.02;
    h.pending.push({ proposalId: "old", sessionId: SESSION, credits: 2 });
    expect(await ask(h, { body: { campaignId: CAMPAIGN, message: "write me a python script" } })).toEqual({ status: 422, error: "ask_off_topic" });
    expect(h.requests).toEqual([]);
    expect(h.holds).toEqual([]);
    expect(h.settleCalls).toBe(0);
    expect(h.pending).toHaveLength(1);
    expect(h.sessions.size).toBe(0);
    expect(h.charges).toEqual([]);
    expect(h.events).toEqual([]);
  });

  // Bug caught: a judge outage refusing every DM.
  it("lets the turn through, and logs, when the judge has no key, throws, or times out", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const answer of [null, "throws"] as const) {
      const h = harness();
      h.scope.answer = answer;
      h.steps.push(say("Harl runs it."));
      expect(await ask(h)).toBeNull();
      expect(types(h)).toContain("done");
    }
    quiet.mockRestore();
  });

  // Bug caught: "yes" or a chip reply judged alone, where it means nothing and would be refused.
  it("judges a short follow-up with the turn before it, and a long message alone", async () => {
    const h = harness();
    h.steps.push(say("Which Harl?"), say("The miller runs it."), say("ok"));
    await ask(h);
    await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "the miller" } });
    await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: `Tell me everything about ${"the mill and its people ".repeat(6)}` } });
    expect(h.scope.asked[0].state).not.toHaveProperty("earlier");
    expect(h.scope.asked[1].state).toMatchObject({ message: "the miller", earlier: { the_dm_said: "Who runs the mill?", the_assistant_said: "Which Harl?" } });
    expect(h.scope.asked[2].state).not.toHaveProperty("earlier");
  });

  // Bug caught: a failing read of the earlier turn blocking a short follow-up.
  it("judges a short follow-up alone when the earlier turn cannot be read", async () => {
    const h = harness();
    h.steps.push(say("a"), say("b"));
    await ask(h);
    h.deps.loadTurns = async () => { throw new Error("db"); };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "yes" } });
    quiet.mockRestore();
    expect(h.scope.asked[1].state).not.toHaveProperty("earlier");
  });
});

describe("the output check", () => {
  const code = "```python\ndef fib(n):\n    return n\n```";

  // Bug caught: code reaching the DM, or staying in the stored conversation to be read back next turn.
  it("withholds an answer that is code: the browser takes the words back, the sentence is stored, and the turn is still metered", async () => {
    const h = harness();
    h.steps.push(say(code));
    expect(await ask(h)).toBeNull();
    expect(h.events).toContainEqual({ type: "error", message: ASK_OFF_TOPIC_MESSAGE, withheld: true });
    expect(done(h)).toBeDefined();
    const stored = h.turns.find((t) => t.role === "assistant");
    expect(JSON.stringify(stored?.blocks)).toContain(ASK_OFF_TOPIC_MESSAGE);
    expect(JSON.stringify(stored?.blocks)).not.toContain("def fib");
    expect(h.charges).toEqual([0.6]);
  });

  // Bug caught: a withheld turn that also proposed kept its route, so the server billed it as a routed turn (and the
  // card stayed runnable) though the DM was told the answer was refused.
  it("records no route for a withheld turn that proposed, and meters it as an answer", async () => {
    const h = harness();
    const proposing = call("c1", "propose", { generator: "npc", concept: "a" });
    h.steps.push({ ...proposing, blocks: [{ type: "text", text: code }, ...proposing.blocks] });
    await ask(h);
    expect(h.events).toContainEqual({ type: "error", message: ASK_OFF_TOPIC_MESSAGE, withheld: true });
    expect(h.pending).toEqual([]);
    expect(done(h)).toMatchObject({ routed: false });
    expect(h.charges).toHaveLength(1);
  });

  it("leaves an ordinary answer alone", async () => {
    const h = harness();
    h.steps.push(say("Harl runs the mill."));
    await ask(h);
    expect(h.events.some((e) => e.type === "error")).toBe(false);
    expect(JSON.stringify(h.turns.find((t) => t.role === "assistant")?.blocks)).toContain("Harl runs the mill.");
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
    expect(loadRecord).toHaveBeenCalledWith(expect.objectContaining({ id: CAMPAIGN }), "npc", NPC);
    expect(JSON.stringify(h.requests[0].messages)).not.toContain(NPC);
  });

  it("tells the browser what an answer read, by name", async () => {
    const h = harness();
    h.steps.push(call("c1", "search", { query: "harl" }), say("Harl runs it."));
    await ask(h);
    expect(h.events).toContainEqual({ type: "read", records: [{ type: "npc", id: NPC, name: "Harl" }] });
  });
});

describe("the manual", () => {
  // Bug caught: the handler not wiring the ledger dep through, so "the manual does not cover it" was said but never noted.
  it("notes a gap with the question and pages only, through the dep the handler was given", async () => {
    const h = harness();
    h.steps.push(
      call("c1", "read_manual", { query: "zzqx flurble" }),
      call("c2", "log_manual_gap", { question: "What does the flurble switch do?", pages_checked: ["worldbuilding-canon", "not-a-page"] }),
      say("The manual does not cover it yet. It has been noted for the team."),
    );
    await ask(h);
    expect(h.gaps).toEqual([{ question: "What does the flurble switch do?", pages: ["worldbuilding-canon"] }]);
  });
});

describe("a proposal", () => {
  it("is routed: not charged, not counted, written as pending, and its cost is written as a free routing line", async () => {
    const h = harness();
    h.usage = { day: TODAY, free_used: 5 };
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a baker who lies" }));
    expect(await ask(h)).toBeNull();
    expect(h.charges).toEqual([]);
    // 100 output tokens: 0.1 credits, kept exactly until the DM runs the generator or the next turn meters it.
    expect(h.pending).toEqual([{ proposalId: "proposal-1", sessionId: SESSION, credits: 0.1 }]);
    expect(h.ledger).toEqual([{ kind: "charge", reason: "ask_routing", cost: 0, isByok: false }]);
    expect(done(h)).toMatchObject({ routed: true, credits: 0 });
    expect(types(h)).toContain("propose");
  });

  it("writes no pending route for a turn that was not kept, and none for an own key", async () => {
    const h = harness();
    h.deps.appendTurns = async () => "conflict";
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a" }));
    await ask(h);
    expect(h.pending).toEqual([]);
    const own = harness();
    own.byok = true;
    own.steps.push(call("c1", "propose", { generator: "npc", concept: "a" }));
    await ask(own);
    expect(own.pending).toEqual([]);
    expect(own.settleCalls).toBe(0);
  });

  it("still answers when the route could not be recorded: the DM is never charged for bookkeeping", async () => {
    const h = harness();
    h.deps.recordRoute = async () => { throw new Error("db"); };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a" }));
    expect(await ask(h)).toBeNull();
    quiet.mockRestore();
    expect(done(h)).toMatchObject({ routed: true, credits: 0 });
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

describe("earlier routed turns, settled at admission", () => {
  async function routedThenAsk(h: Harness, generated: boolean) {
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a" }, 5000), say("Harl runs it."));
    await ask(h); // routed: 5 credits measured, pending, nothing charged
    expect(h.charges).toEqual([]);
    h.generations = generated ? 1 : 0;
    h.events.length = 0;
    await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "And the bakery?" } });
  }

  it("charges nothing for a route the DM ran the generator after", async () => {
    const h = harness();
    await routedThenAsk(h, true);
    expect(h.ledger.filter((l) => l.reason === "ask_answer" && (l.cost ?? 0) > 0)).toEqual([]);
    expect(h.holds.at(-1)).toBe(0);
    expect(h.pending).toEqual([]);
  });

  // Bug caught: what earlier routes owed spent under this turn's hold, after settlement had already removed them, so a
  // refused hold lost the debt. Settlement charges it itself (`settle_ask_routes`, pgTAP); the turn holds only its own.
  it("meters a route nothing was generated after, and holds only this answer's credit, not what the route owed", async () => {
    const h = harness();
    h.usage = { day: TODAY, free_used: 5 };
    await routedThenAsk(h, false);
    expect(h.holds.at(-1)).toBe(1);
    expect(h.ledger.filter((l) => l.reason === "ask_answer").map((l) => l.cost)).not.toContain(5);
  });

  it("meters an ungenerated route as a free answer while the day has some left, and holds nothing", async () => {
    const h = harness();
    await routedThenAsk(h, false);
    expect(h.holds.at(-1)).toBe(0);
    expect(h.usage).toEqual({ day: TODAY, free_used: 2 });
  });

  it("does not refuse the turn when settlement fails, and leaves the routes open for next time", async () => {
    const h = harness();
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a" }), say("ok"));
    await ask(h);
    h.settleFails = true;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "more" } })).toBeNull();
    quiet.mockRestore();
    expect(h.pending).toHaveLength(1);
    expect(types(h)).toContain("done");
  });

  it("refuses with the upsell when the answer's credit cannot be held", async () => {
    const h = harness();
    h.usage = { day: TODAY, free_used: 5 };
    h.steps.push(call("c1", "propose", { generator: "npc", concept: "a" }, 5000));
    await ask(h);
    h.held.refuse = true;
    expect(await ask(h, { body: { campaignId: CAMPAIGN, sessionId: SESSION, message: "more" } })).toEqual({ status: 402, error: "ask_allowance_spent" });
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

describe("a report about the app (the free draft path)", () => {
  const BUG = { kind: "bug", where: "/quests", action: "Dragged a quest", expected: "It moves", actual: "It snaps back" };
  const reporting = (h: Harness) => { h.scope.answer = 0.02; h.scope.report = { app_report: 0.9, is_bug: 0.9 }; };
  const say_ = "the quest list will not let me drag, it snaps back";
  const body = { campaignId: CAMPAIGN, message: say_, context: { route: "/quests", title: "Quests" } };

  // Bug caught: the report path charging, counting, holding, saving a turn or opening a session, so a report cost the
  // DM one of the five free answers or a credit.
  it("drafts the report and nothing else: no hold, no charge, no count, no saved turn, no session", async () => {
    const h = harness();
    reporting(h);
    h.steps.push(call("c1", "draft_report", BUG));
    expect(await ask(h, { body })).toBeNull();
    expect(h.events.find((e) => e.type === "report")).toEqual({ type: "report", report: BUG });
    expect(done(h)).toEqual({ type: "done", end: "done", routed: false, free: false, credits: 0, freeLeft: 5 });
    expect(h.holds).toEqual([0]);
    expect(h.charges).toEqual([]);
    expect(h.usage).toBeNull();
    expect(h.appends).toBe(0);
    expect(h.turns).toEqual([]);
    expect(h.sessions.size).toBe(0);
    expect(h.pending).toEqual([]);
    expect(h.ledger.filter((l) => l.kind === "charge")).toEqual([]);
    expect(h.ledger).toEqual([{ kind: "free", reason: "ask_report", tokens: 100 }]);
  });

  // Bug caught: the report turn streaming the model's words, which would make it a free way to get an answer.
  it("streams no text and shows the model only draft_report, even when it writes an answer", async () => {
    const h = harness();
    reporting(h);
    h.steps.push({ blocks: [{ type: "text", text: "Sure! Here is how to fix your quest list..." }, { type: "tool_call", id: "c1", name: "draft_report", input: BUG }], stop: "tool_calls", usage: usage(100) });
    await ask(h, { body });
    expect(types(h)).toEqual(["report", "done"]);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].tools.map((t) => t.name)).toEqual(["draft_report"]);
    expect(JSON.stringify(h.requests[0])).not.toContain("propose");
  });

  // Bug caught: no draft when the model drew none, leaving the DM with a report that could not be sent.
  it("uses the DM's own words when the model draws no draft, or an invalid one", async () => {
    for (const steps of [[say("I cannot help with that.")], [call("c1", "draft_report", { kind: "bug", where: "x" }), say("sorry")]]) {
      const h = harness();
      reporting(h);
      h.steps.push(...steps);
      await ask(h, { body });
      expect(h.events.find((e) => e.type === "report")).toEqual({
        type: "report",
        report: { kind: "bug", where: "Quests, /quests", action: say_, expected: "See what I wrote above.", actual: "See what I wrote above." },
      });
      expect(types(h)).not.toContain("text");
    }
  });

  // Bug caught: a provider failure on this path losing the DM's report instead of handing back their words.
  it("still gives the fallback draft when the provider fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const h = harness();
    reporting(h);
    h.scope.report = { app_report: 0.9, is_bug: 0.1 };
    await ask(h, { body });
    quiet.mockRestore();
    expect(h.events.find((e) => e.type === "report")).toMatchObject({ report: { kind: "feature", summary: say_, problem: say_ } });
    expect(types(h)).toEqual(["report", "done"]);
    expect(h.charges).toEqual([]);
  });

  // Bug caught: the report path skipping the earlier routes' settlement, so routed turns are never confirmed or charged.
  it("still settles earlier routes, and reports the unchanged free answers left", async () => {
    const h = harness();
    reporting(h);
    h.pending.push({ proposalId: "old", sessionId: SESSION, credits: 2 });
    h.steps.push(call("c1", "draft_report", BUG));
    await ask(h, { body });
    expect(h.settleCalls).toBe(1);
    expect(h.pending).toEqual([]);
    expect(done(h).freeLeft).toBe(4);
  });

  // Bug caught: the report verdict being ignored, so a bug report is refused as off topic.
  it("is not refused as off topic although in_scope is low", async () => {
    const h = harness();
    reporting(h);
    h.steps.push(call("c1", "draft_report", BUG));
    expect(await ask(h, { body })).toBeNull();
  });

  // Bug caught: an ordinary turn that drafts a report not counting as an answer (it is a normal turn, so it is metered).
  it("counts and charges an ordinary turn that ends in a draft, as any answer", async () => {
    const h = harness();
    h.steps.push(call("c1", "draft_report", BUG));
    await ask(h, { body: { campaignId: CAMPAIGN, message: "who runs the mill? also the map editor is broken" } });
    expect(h.events.find((e) => e.type === "report")).toEqual({ type: "report", report: BUG });
    expect(h.charges).toHaveLength(1);
    expect(h.appends).toBe(1);
  });
});
