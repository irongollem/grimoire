// Folding the older messages of a conversation into its rolling summary (#1253), after the turn is saved and told.
// Shared by the AI table and Ask. It runs after the user already has their answer, so whatever happens in here is
// logged and nothing is emitted.

import type { CreditLogFields } from "../../credits.ts";
import type { JobLedger } from "../../pipeline/creditHold.ts";
import { creditsForUsd, usdForSteps, type CreditCalibration, type ModelPrice } from "../metering.ts";
import { planSummary, summarise } from "../summary.ts";
import type { StoredTurn } from "../transcript.ts";
import type { AgentUsage, CallModel } from "../types.ts";
import { round6 } from "./turnStore.ts";

export async function foldIntoSummary(input: {
  saveSummary(input: {
    sessionId: string;
    expectedThroughSeq: number;
    throughSeq: number;
    summary: string;
    usage: AgentUsage;
    credits: number;
  }): Promise<{ due: number } | "stale">;
  ledger: JobLedger;
  session: { id: string; summary: string | null; summary_through_seq: number };
  storedNow: StoredTurn[];
  callModel: CallModel;
  price: ModelPrice;
  calibration: CreditCalibration;
  /** The ledger reason of the summary call's line. */
  reason: string;
  /** False when the function bills somewhere else (Ask): the summary is accrued on the session and logged, never charged. */
  billed: boolean;
  logName: string;
}): Promise<void> {
  const { session, logName } = input;
  const lineCost = (due: number) => (input.billed ? due : 0);
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
    const logWithoutCharge = async () => input.ledger.charge(input.reason, { cost: 0, log: logFields });

    // Nothing to store and nothing to bill, but the provider was paid for the call, so the tokens are logged.
    if (summary === null) {
      await safelyLog(logName, logWithoutCharge);
      return;
    }

    const credits = round6(creditsForUsd(usdForSteps([usage], input.price), input.calibration));
    // Like a turn: a summary that was not kept is not billed, but its tokens were spent and are logged.
    let saved: { due: number } | "stale" | "failed";
    try {
      saved = await input.saveSummary({
        sessionId: session.id,
        expectedThroughSeq: session.summary_through_seq,
        throughSeq: plan.throughSeq,
        summary,
        usage,
        credits,
      });
    } catch (error) {
      console.error(`${logName}: saving the summary failed:`, error);
      saved = "failed";
    }
    if (saved === "stale" || saved === "failed") {
      await safelyLog(logName, logWithoutCharge);
      return;
    }
    const due = lineCost(saved.due);
    await safelyLog(logName, async () => input.ledger.charge(input.reason, { cost: due, log: logFields }));
  } catch (error) {
    console.error(`${logName}: the summary failed:`, error);
  }
}

async function safelyLog(logName: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(`${logName}: bookkeeping failed:`, error);
  }
}
