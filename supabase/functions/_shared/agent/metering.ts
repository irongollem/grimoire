// What a turn of an AI-run table costs, in credits (#1205). Pure: prices and calibration come in as plain values.
//
// House policy (`credit-math.ts`) is that nobody is billed or shown a fraction of a credit. A turn of play costs a
// small fraction of one, so rounding each turn up would overcharge by about half. A session therefore ACCRUES exact
// fractional credits, and a turn bills only the whole credits the running total has newly crossed.

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

// A total that is a whole number up to float noise (0.3 + 0.7 is 0.9999999999999999) counts as that whole number,
// the same epsilon `wholeCredits` uses.
const EPSILON = 1e-9;

function wholeSoFar(accrued: number): number {
  if (!Number.isFinite(accrued) || accrued <= 0) return 0;
  const nearest = Math.round(accrued);
  if (Math.abs(accrued - nearest) < EPSILON) return nearest;
  return Math.floor(accrued);
}

/** The whole credits newly crossed going from one accrued total to the next. Never negative. */
export function creditsDue(accruedBefore: number, accruedAfter: number): number {
  return Math.max(0, wholeSoFar(accruedAfter) - wholeSoFar(accruedBefore));
}
