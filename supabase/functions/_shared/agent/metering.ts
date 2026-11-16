// What a turn of an AI-run table costs, in credits (#1205). Pure: prices and calibration come in as plain values.
//
// House policy (`credit-math.ts`) is that nobody is billed or shown a fraction of a credit. A turn of play costs a
// small fraction of one, so rounding each turn up would overcharge by about half. A session therefore ACCRUES exact
// fractional credits, and only the whole credits the running total has newly crossed are billed. Which whole credits
// those are is decided in SQL under the session's row lock (`append_agent_turns`, `summarise_agent_session`), not
// here: a turn and a summary finishing together could otherwise each claim the same credit.

import type { AgentUsage } from "./types.ts";

/** USD per million tokens, as `ai_model_pricing` stores them. */
export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Null when the provider has no cheaper cached rate on file: cache reads are then billed at the full input rate. */
  cachedInputPerMillion: number | null;
}

export interface CreditCalibration {
  /** What one credit is worth to us in USD. */
  usdPerCredit: number;
  /** The multiple of provider cost that is charged. */
  margin: number;
}

const PER_MILLION = 1_000_000;

export function usdForUsage(usage: AgentUsage, price: ModelPrice): number {
  // A missing cached rate must never make cached input cheaper than it is, so it falls back to the full rate.
  const cachedRate = price.cachedInputPerMillion ?? price.inputPerMillion;
  return (
    (usage.inputTokens * price.inputPerMillion +
      usage.cacheWriteTokens * price.inputPerMillion +
      usage.cacheReadTokens * cachedRate +
      usage.outputTokens * price.outputPerMillion) /
    PER_MILLION
  );
}

export function usdForSteps(steps: AgentUsage[], price: ModelPrice): number {
  let total = 0;
  for (const step of steps) total += usdForUsage(step, price);
  return total;
}

/** Exact, not rounded. A broken calibration throws: returning 0 would make play free. */
export function creditsForUsd(usd: number, calibration: CreditCalibration): number {
  const { usdPerCredit, margin } = calibration;
  if (!Number.isFinite(usdPerCredit) || usdPerCredit <= 0 || !Number.isFinite(margin) || margin <= 0) {
    throw new Error("Credit calibration is not usable");
  }
  return (usd * margin) / usdPerCredit;
}
