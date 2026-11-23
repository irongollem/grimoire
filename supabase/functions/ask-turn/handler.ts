// One turn of Ask Grimoire (#1253): who may ask, what the answer may cost, the loop, and the save.
//
// No Deno and no Supabase in here. Everything with I/O comes in through `AskTurnDeps`, so the rules are tested
// against an in-memory store (`handler.test.ts`) and `index.ts` only wires real dependencies to them.
//
// Two phases, because the HTTP layer must answer a plain JSON status before it opens a stream, as the AI table's does:
//   `beginAsk`  the shared gates (`_shared/agent/conversation/gates.ts`), the context record's check and the day's
//               allowance. Returns a refusal or `run`. Nothing has been streamed yet.
//   `run`       opens the conversation if it is new, reads its history, runs the loop with Ask's tools, saves, settles
//               the answer on the ledger (`askBilling.ts`), says `done`, then may fold the older messages into the
//               rolling summary. The hold is taken first (`holdAsk`) and settled by `run`.

import type { AskEvent, AskTurnBody } from "../_shared/agent/askContract.ts";
import { ASK_OFF_TOPIC_MESSAGE, ASK_REFUSALS } from "../_shared/agent/askContract.ts";
import { parseAskBody } from "../_shared/agent/askBody.ts";
import { reserveFor, settleAnswer, settleEarlierRoutes, spendOwedRoutes } from "../_shared/agent/askBilling.ts";
import { checkOutput } from "../_shared/agent/askOutput.ts";
import { checkScope, earlierFrom, isShortFollowUp, type ScopeEarlier } from "../_shared/agent/askScope.ts";
import { ASK_HEADINGS, askState, askSystem } from "../_shared/agent/askPrompt.ts";
import { createReadLog, seedReadLog } from "../_shared/agent/askReads.ts";
import { makeAskTools } from "../_shared/agent/askTools.ts";
import {
  ASK_MAX_OUTPUT_TOKENS,
  ASK_MAX_STEPS,
  ASK_MESSAGES,
  ASK_TOKEN_BUDGET,
  type AskBegin,
  type AskTurnDeps,
} from "../_shared/agent/askTypes.ts";
import { admitConversation, type Refusal } from "../_shared/agent/conversation/gates.ts";
import { foldIntoSummary } from "../_shared/agent/conversation/foldSummary.ts";
import { safeEmit } from "../_shared/agent/conversation/stream.ts";
import { round6, saveTurn } from "../_shared/agent/conversation/turnStore.ts";
import { gameSystemEdition } from "../_shared/gameSystem.ts";
import { creditsForUsd, usdForSteps } from "../_shared/agent/metering.ts";
import { runTurn } from "../_shared/agent/turn.ts";
import { historyFrom, systemWithSummary, type StoredTurn } from "../_shared/agent/transcript.ts";
import { AgentProviderError, type AgentBlock } from "../_shared/agent/types.ts";
import type { CreditLogFields } from "../_shared/credits.ts";
import { jsonError } from "../_shared/pipeline/respond.ts";

export async function beginAsk(input: { userId: string; body: unknown; deps: AskTurnDeps }): Promise<AskBegin> {
  const { userId, deps } = input;
  const parsed = parseAskBody(input.body);
  if (!parsed.ok) return { kind: "refused", refusal: { status: 400, error: ASK_MESSAGES.badBody } };
  const body: AskTurnBody = parsed.body;

  const gated = await admitConversation({
    userId,
    campaignId: body.campaignId,
    sessionId: body.sessionId,
    message: body.message,
    kind: "ask",
    kindOf: (session) => session.kind,
    deps,
    messages: ASK_MESSAGES,
    logName: "ask-turn",
  });
  if (gated.kind === "refused") return gated;
  const { campaign, existing, provider, callModel, price, calibration } = gated.admitted;

  // Where the DM was: the record they had open is checked against THIS campaign before it is read or named. An id
  // that is not the campaign's is ignored, never an error: the page asked about where it was, and the route says that.
  let recordName: string | null = null;
  if (body.context?.record !== undefined) {
    try {
      const found = await deps.loadRecord(campaign.id, body.context.record.type, body.context.record.id);
      recordName = found === null ? null : found.name;
    } catch (error) {
      console.error("ask-turn: reading the record the DM had open failed:", error);
    }
  }

  // Is this about the campaign? Before the settlement and the hold, so a refusal costs the DM nothing and counts as
  // nothing (and consumes no earlier route). It fails open: the standing instructions and the output check still guard.
  let earlierTurn: ScopeEarlier | null = null;
  if (existing !== null && isShortFollowUp(body.message)) {
    try {
      earlierTurn = earlierFrom(await deps.loadTurns(existing.id, existing.summary_through_seq));
    } catch (error) {
      console.error("ask-turn: reading the turn before for the scope check failed:", error);
    }
  }
  const scope = await checkScope({ message: body.message, earlier: earlierTurn, judgeScope: (request) => deps.judgeScope(request) });
  if (scope.kind === "off_topic") return { kind: "refused", refusal: { status: 422, error: ASK_REFUSALS.offTopic } };

  // Earlier routed turns are settled first: each is free if the DM ran a generator after it, else metered as an answer
  // (`settle_ask_routes`, which also says how many free answers are left). Own-key use is never counted, so an own-key
  // account never calls it and none of its routes exist. A settlement that fails is logged and owes nothing now.
  const earlier = await settleEarlierRoutes({ userId, isByok: provider.isByok, settleRoutes: (id) => deps.settleRoutes(id) });
  const freeLeft = earlier.freeLeft;
  const owed = earlier.credits;

  const fiveE = gameSystemEdition(campaign.game_system) !== undefined;

  const run = async (send: (event: AskEvent) => void, signal: AbortSignal | undefined, reservationIds: string[]): Promise<void> => {
    const emit = safeEmit(send);
    // Settled whatever the outcome (success, failure, conflict, abort): released once, then the ledger lines written.
    await deps.settle(userId, reservationIds, async (ledger) => {
      // The routes were consumed by settlement, so what they came to is spent first, whatever happens to this turn.
      spendOwedRoutes(ledger, owed);
      try {
        const session = existing ?? await deps.createSession({ userId, campaignId: campaign.id, provider: provider.provider, model: provider.model });
        emit({ type: "session", sessionId: session.id });

        const stored: StoredTurn[] = await deps.loadTurns(session.id, session.summary_through_seq);
        const lastSeqLoaded = stored.reduce((max, row) => Math.max(max, row.seq), 0);
        const history = historyFrom(stored, session.summary_through_seq);

        // What this conversation has read, so an idea may cite a record an earlier turn opened and nothing else.
        const reads = createReadLog();
        seedReadLog(reads, history);
        const tools = makeAskTools({
          campaign,
          fiveE,
          mcpTools: deps.mcpTools,
          callMcp: deps.callMcp(campaign.id),
          find: (query) => deps.find(campaign, query),
          loadRecord: (type, id) => deps.loadRecord(campaign.id, type, id),
          newId: () => deps.newId(),
          reads,
          emit,
        });

        const result = await runTurn({
          system: systemWithSummary(askSystem({ campaignName: campaign.name, fiveE }), session.summary),
          state: askState({ context: body.context, recordName }),
          headings: ASK_HEADINGS,
          history,
          user: body.message,
          tools: tools.tools,
          callModel: tools.endAware(callModel, { provider: provider.provider, model: provider.model }),
          callTool: tools.callTool,
          limits: { maxSteps: ASK_MAX_STEPS, maxOutputTokens: ASK_MAX_OUTPUT_TOKENS, tokenBudget: ASK_TOKEN_BUDGET },
          signal,
          onEvent: (event) => {
            if (event.type === "text") emit({ type: "text", delta: event.delta });
            else if (event.type === "tool_start") emit({ type: "tool_start", name: event.name });
            else if (event.type === "tool_end") emit({ type: "tool_end", name: event.name, isError: event.isError });
          },
        });

        // The last guard: an answer that is code is withheld. The words may already have streamed, so the browser is
        // told to take them back (`withheld`); what is stored is the sentence, so the next turn does not see code
        // either. The turn still counts and is metered: the tokens were spent.
        let withheld = false;
        const added = result.added.map((message) => {
          if (message.role !== "assistant") return message;
          const said = message.blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
          if (!checkOutput(said).withheld) return message;
          withheld = true;
          // The sentence takes the first text block's place, so a call that followed the words still follows them.
          let placed = false;
          const blocks = message.blocks.flatMap<AgentBlock>((b) => {
            if (b.type !== "text") return [b];
            if (placed) return [];
            placed = true;
            return [{ ...b, text: ASK_OFF_TOPIC_MESSAGE }];
          });
          return { ...message, blocks };
        });
        const kept = withheld ? { ...result, added } : result;

        const billed = [...result.steps, ...result.toolSteps.map((t) => t.usage)];
        // Stopped before the first model call: nothing to save, and nothing that counts as an answer.
        if (result.steps.length === 0) {
          emit({ type: "done", end: result.end, routed: false, free: false, credits: 0, freeLeft });
          return;
        }
        const accrued = !provider.isByok && price && calibration ? round6(creditsForUsd(usdForSteps(billed, price), calibration)) : 0;
        const last = result.steps[result.steps.length - 1];
        // ledger input_tokens is ALL input (full rate, cache read and cache write); the exact split is on the rows.
        const log: CreditLogFields = {
          model: last.model,
          provider: last.provider,
          input_tokens: billed.reduce((n, s) => n + s.inputTokens + s.cacheReadTokens + s.cacheWriteTokens, 0),
          output_tokens: billed.reduce((n, s) => n + s.outputTokens, 0),
        };

        // Save first, then settle: a turn that was not kept takes no free answer and no credit.
        const saved = await saveTurn({
          appendTurns: (sessionId, afterSeq, rows, credits) => deps.appendTurns(sessionId, afterSeq, rows, credits),
          sessionId: session.id,
          userId,
          lastSeq: lastSeqLoaded,
          result: kept,
          credits: accrued,
          logName: "ask-turn",
        });
        if (saved.kind !== "kept") {
          // The tokens were spent, so they are logged, at no charge.
          ledger.charge("ask_answer", { cost: 0, isByok: provider.isByok, log });
          emit({ type: "error", message: saved.kind === "conflict" ? ASK_MESSAGES.conflict : ASK_MESSAGES.notSaved });
          return;
        }
        // A routed turn is pending until the DM runs the generator (see askBilling.ts). Only a kept turn is written, and
        // never for an own key. Failing to write it costs the platform one routed turn, never the DM or the answer.
        const proposal = tools.proposal();
        if (proposal !== null && !provider.isByok) {
          try {
            await deps.recordRoute(userId, { proposalId: proposal.proposalId, sessionId: session.id, credits: accrued });
          } catch (error) {
            console.error("ask-turn: recording the routed turn failed:", error);
          }
        }
        // `saved.due` is not used: the session's own accrual is bookkeeping, and billing is `charge_ask_answer`'s.
        const settlement = await settleAnswer({
          userId,
          routed: proposal !== null,
          isByok: provider.isByok,
          accrued,
          freeLeft,
          ledger,
          log,
          chargeAnswer: (id, credits) => deps.chargeAnswer(id, credits),
        });
        if (withheld) emit({ type: "error", message: ASK_OFF_TOPIC_MESSAGE, withheld: true });
        emit({ type: "done", end: result.end, routed: settlement.routed, free: settlement.free, credits: settlement.credits, freeLeft: settlement.freeLeft });

        // After `done`, never before: the DM must not wait for housekeeping. An abort is the DM leaving.
        if (result.end !== "aborted") {
          const storedNow: StoredTurn[] = [...stored, ...saved.rows.map((r) => ({ seq: r.seq, role: r.role, blocks: r.blocks }))];
          await foldIntoSummary({
            saveSummary: (summary) => deps.saveSummary(summary),
            ledger,
            session,
            storedNow,
            callModel,
            isByok: provider.isByok,
            price,
            calibration,
            reason: "ask_summary",
            billed: false,
            logName: "ask-turn",
          });
        }
      } catch (error) {
        // Nothing is saved and nothing charged. The provider's own message can name the model or the key's
        // organisation, so the browser gets a sentence of ours; the real one goes to the log.
        console.error("ask-turn: the turn failed:", error);
        emit({ type: "error", message: error instanceof AgentProviderError && error.retryable ? ASK_MESSAGES.providerBusy : ASK_MESSAGES.failed });
      }
    });
  };

  return { kind: "ready", reserve: reserveFor({ freeLeft, owed, isByok: provider.isByok }), run };
}

/**
 * Takes the hold and starts the stream under it. A refused hold is answered before any stream opens: a shortfall of
 * credits is the page's cue for the upsell (`ask_allowance_spent`), and any other refusal (a frozen account, a
 * new account's velocity cap, metering down) keeps its own code.
 */
export async function holdAsk(
  deps: AskTurnDeps,
  userId: string,
  begun: Extract<AskBegin, { kind: "ready" }>,
  start: (reservationIds: string[]) => Response | Promise<Response>,
): Promise<Response> {
  let ran = false;
  const answer = await deps.withHold(userId, begun.reserve, async (hold) => {
    ran = true;
    return start(hold.handOff());
  });
  if (ran) return answer;
  if (answer.status === 402) return jsonError(402, ASK_REFUSALS.allowanceSpent);
  return answer;
}

/** The whole turn in one call, for a caller that does not need to answer a status before streaming (the tests). */
export async function handleAskTurn(input: {
  userId: string;
  body: unknown;
  deps: AskTurnDeps;
  send: (event: AskEvent) => void;
  signal?: AbortSignal;
}): Promise<Refusal | null> {
  const begun = await beginAsk({ userId: input.userId, body: input.body, deps: input.deps });
  if (begun.kind === "refused") return begun.refusal;
  const answer = await holdAsk(input.deps, input.userId, begun, async (ids) => {
    await begun.run(input.send, input.signal, ids);
    return new Response(null, { status: 204 });
  });
  if (answer.status === 204) return null;
  const detail: unknown = await answer.json().catch(() => null);
  const code = typeof detail === "object" && detail !== null && "error" in detail && typeof detail.error === "string" ? detail.error : "refused";
  return { status: answer.status, error: code };
}
