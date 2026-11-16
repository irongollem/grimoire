// What a turn does around the loop: reading the scene and the record for the system text, folding old messages into
// the summary, and the two small helpers both use. Split from `handler.ts` so the handler holds the turn's rules.

import { creditsForUsd, usdForSteps, type CreditCalibration, type ModelPrice } from "../_shared/agent/metering.ts";
import { planSummary, summarise } from "../_shared/agent/summary.ts";
import type { StoredTurn } from "../_shared/agent/transcript.ts";
import { trimScene, type TrimmedScene } from "../_shared/agent/scene.ts";
import type { RecordedFact } from "../_shared/agent/record.ts";
import type { CallModel } from "../_shared/agent/types.ts";
import type { CreditLogFields } from "../_shared/credits.ts";
import type { AgentTurnDeps, SessionRow } from "./handler.ts";

// The session's credits hold six decimals; accruing at the same precision keeps what is sent equal to what is stored.
export function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** The party's place for the system text. A place that will not load is no place: the turn still runs. */
export async function sceneOf(deps: AgentTurnDeps, campaignId: string, locationId: string | null) {
  if (locationId === null) return null;
  try {
    const view = await deps.loadScene(campaignId, locationId);
    return view ? trimScene(view) : null;
  } catch (error) {
    console.error("agent-turn: loading the scene failed:", error);
    return null;
  }
}

/** What is on record for the place and the people in it. A record that will not load is an empty one: the turn still runs. */
export async function recordOf(deps: AgentTurnDeps, campaignId: string, scene: TrimmedScene | null): Promise<RecordedFact[]> {
  try {
    return await deps.loadRecord(campaignId, {
      locationId: scene ? scene.id : null,
      characterIds: scene ? scene.characters.map((c) => c.id) : [],
    });
  } catch (error) {
    console.error("agent-turn: loading the record failed:", error);
    return [];
  }
}

/**
 * Folds the older messages into the session's summary when the conversation has grown. It runs after the turn has
 * been saved, charged and reported, so whatever happens in here, the player already has their answer: everything
 * thrown is logged and nothing is emitted.
 */
export async function foldIntoSummary(input: {
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
export async function safely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error("agent-turn: bookkeeping failed:", error);
  }
}
