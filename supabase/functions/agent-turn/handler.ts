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
import { planSummary, summarise } from "../_shared/agent/summary.ts";
import { rulesetLabelFor, soloTableSystem } from "../_shared/agent/soloTablePrompt.ts";
import { makeSpeechTools, SPEECH_TOOL_NAMES, type SpeechToolsDeps } from "../_shared/agent/speak.ts";
import {
  AgentProviderError,
  type AgentLine,
  type AgentTool,
  type AgentUsage,
  type CallModel,
  type CallTool,
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
/** The longest message a player may send. */
export const MAX_MESSAGE_CHARS = 4000;
/** Held before the turn so an account with no credits is refused before any model call; the real charge is metered. */
export const RESERVE_CREDITS = 1;

export interface AgentTurnBody {
  campaignId: string;
  sessionId?: string;
  message: string;
  /** Enter says it aloud, Alt+Enter does it: the player chooses, nothing guesses from the wording. */
  mode: "say" | "do";
}

/** A refusal before the stream opened: an ordinary JSON response. */
export interface Refusal {
  status: number;
  error: string;
}

/** What the browser hears. It never carries a tool's input or result: those can hold DM-only material. */
export type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; isError: boolean }
  /** What a character said or visibly did. It is the one thing a tool shows the browser: it is meant for the page. */
  | { type: "line"; line: AgentLine }
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
  createSession(input: { userId: string; campaignId: string; provider: string; model: string }): Promise<SessionRow>;
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
   * A character of this campaign as its own call may know it: its record and its memories, nothing else. Null when
   * the id is not a character of THIS campaign, whoever asks.
   */
  loadSpeaker(campaignId: string, characterId: string): ReturnType<SpeechToolsDeps["loadSpeaker"]>;
}

export const MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That conversation was not found.",
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseBody(raw: unknown): { ok: true; body: AgentTurnBody } | { ok: false } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false };
  const r = raw as Record<string, unknown>;
  if (typeof r.campaignId !== "string" || !UUID_RE.test(r.campaignId)) return { ok: false };
  if (r.sessionId !== undefined && (typeof r.sessionId !== "string" || !UUID_RE.test(r.sessionId))) return { ok: false };
  if (typeof r.message !== "string") return { ok: false };
  const message = r.message.trim();
  if (message.length < 1 || message.length > MAX_MESSAGE_CHARS) return { ok: false };
  if (r.mode !== "say" && r.mode !== "do") return { ok: false };
  return { ok: true, body: { campaignId: r.campaignId, sessionId: r.sessionId, message, mode: r.mode } };
}

/** The player's message as the narrator reads it. The words themselves are never changed. */
export function playerText(mode: "say" | "do", message: string): string {
  return mode === "say"
    ? `The player's character says aloud:\n${message}`
    : `The player's character does this (nothing is said aloud):\n${message}`;
}

// The session's credits hold six decimals; accruing at the same precision keeps what is sent equal to what is stored.
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

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
    flagged = await deps.isFlagged(body.message);
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

    try {
      let session: SessionRow;
      let stored: StoredTurn[];
      let result;
      try {
        session = existing ?? await deps.createSession({
          userId,
          campaignId: campaign.id,
          provider: provider.provider,
          model: provider.model,
        });
        emit({ type: "session", sessionId: session.id });
        stored = await deps.loadTurns(session.id);
        const lastSeqLoaded = stored.reduce((max, row) => Math.max(max, row.seq), 0);
        const history = historyFrom(stored, session.summary_through_seq);
        const system = systemWithSummary(
          soloTableSystem({ id: campaign.id, name: campaign.name, rulesetLabel: rulesetLabelFor(campaign.game_system) }),
          session.summary,
        );

        // A character speaks through its own model call, built from that character alone (`speak.ts`). The same
        // model for now: a cheaper one for speech needs its own price row first.
        const speech = makeSpeechTools({
          stored,
          loadSpeaker: (id) => deps.loadSpeaker(campaign.id, id),
          callModel,
          signal,
        });

        result = await runTurn({
          system,
          history,
          user: playerText(body.mode, body.message),
          player: { kind: body.mode, text: body.message },
          tools: [...deps.tools, ...speech.tools],
          callModel,
          callTool: (name, toolInput) =>
            SPEECH_TOOL_NAMES.has(name) ? speech.call(name, toolInput) : deps.callTool(name, toolInput),
          limits: { maxSteps: MAX_STEPS, maxOutputTokens: MAX_OUTPUT_TOKENS, tokenBudget: TOKEN_BUDGET },
          signal,
          onEvent: (event) => {
            // Names and outcomes only: a tool's input and result can hold DM-only notes the model looked up.
            if (event.type === "text") emit({ type: "text", delta: event.delta });
            else if (event.type === "tool_start") emit({ type: "tool_start", name: event.name });
            else if (event.type === "tool_end") {
              emit({ type: "tool_end", name: event.name, isError: event.isError });
              if (event.line) emit({ type: "line", line: event.line });
            }
          },
        });

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
          await safely(logWithoutCharge);
          emit({ type: "error", message: saved === "conflict" ? MESSAGES.conflict : MESSAGES.notSaved });
          return;
        }

        const { due } = saved;
        if (due > 0 || provider.isByok) {
          await safely(() => deps.recordGeneration(provider.isByok, due, logFields));
        } else {
          await safely(() => deps.recordFreeGeneration(logFields));
        }
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

/**
 * Folds the older messages into the session's summary when the conversation has grown. It runs after the turn has
 * been saved, charged and reported, so whatever happens in here, the player already has their answer: everything
 * thrown is logged and nothing is emitted.
 */
async function foldIntoSummary(input: {
  deps: AgentTurnDeps;
  session: SessionRow;
  storedNow: StoredTurn[];
  callModel: CallModel;
  isByok: boolean;
  price: ModelPrice | null;
  calibration: CreditCalibration | null;
}): Promise<void> {
  const { deps, session, isByok } = input;
  try {
    const plan = planSummary(input.storedNow, session.summary_through_seq);
    if (!plan) return;

    const { summary, usage } = await summarise({
      callModel: input.callModel,
      previousSummary: session.summary,
      fold: plan.fold,
    });
    const logFields: CreditLogFields = {
      model: usage.model,
      provider: usage.provider,
      input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
      output_tokens: usage.outputTokens,
    };
    const logWithoutCharge = () => (isByok ? deps.recordGeneration(true, 0, logFields) : deps.recordFreeGeneration(logFields));

    // Nothing to store and nothing to bill, but the provider was paid for the call, so the tokens are logged.
    if (summary === null) {
      await safely(logWithoutCharge);
      return;
    }

    let credits = 0;
    if (!isByok && input.price && input.calibration) {
      credits = round6(creditsForUsd(usdForSteps([usage], input.price), input.calibration));
    }
    // Like a turn: a summary that was not kept is not billed, but its tokens were spent and are logged.
    let saved: { due: number } | "stale" | "failed";
    try {
      saved = await deps.saveSummary({
        sessionId: session.id,
        expectedThroughSeq: session.summary_through_seq,
        throughSeq: plan.throughSeq,
        summary,
        usage,
        credits,
      });
    } catch (error) {
      console.error("agent-turn: saving the summary failed:", error);
      saved = "failed";
    }
    if (saved === "stale" || saved === "failed") {
      await safely(logWithoutCharge);
      return;
    }
    if (saved.due > 0 || isByok) await safely(() => deps.recordGeneration(isByok, saved.due, logFields));
    else await safely(() => deps.recordFreeGeneration(logFields));
  } catch (error) {
    console.error("agent-turn: the summary failed:", error);
  }
}

// A bookkeeping call after the model has answered must not turn a finished turn into an exception.
async function safely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error("agent-turn: bookkeeping failed:", error);
  }
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
