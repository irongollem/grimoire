// What an Ask answer costs and who pays (#1253), the maintainer's decision of 23 Nov 2026 in rules:
//
//   - A turn that ends at a proposal is routed. It is not charged and does not count against the day's free answers:
//     its cost is inside the price of the generator it chose. Its measured cost is still written, as a free ledger
//     line (`ask_routing`), so what routing costs can be measured.
//   - Any other turn is an answer. The first five a day are free per account; after that an answer is charged from
//     its measured tokens in whole credits, the fraction carried to the next answer. `charge_ask_answer` decides
//     which, under a row lock, so two answers finishing together cannot both take the last free one.
//   - Own-key use is never metered, charged or counted.
//
// Before the stream opens the account must be able to pay for a charged answer: a free one is left, or a credit
// can be held. Pure: the database comes in as functions.

import { FREE_ASKS_PER_DAY } from "./askContract.ts";
import type { AskCharge, AskUsage } from "./askTypes.ts";
import { ASK_RESERVE_CREDITS } from "./askTypes.ts";
import type { CreditLogFields } from "../credits.ts";
import type { JobLedger } from "../pipeline/creditHold.ts";

/** Free answers left today. A count from an earlier UTC day is the day before's: the allowance came back. */
export function freeLeftToday(usage: AskUsage | null, today: string): number {
  if (usage === null || usage.day !== today) return FREE_ASKS_PER_DAY;
  return Math.max(0, FREE_ASKS_PER_DAY - usage.free_used);
}

/** What to hold before the turn: nothing while a free answer is left (or with an own key), else one credit. */
export function reserveFor(input: { freeLeft: number; isByok: boolean }): number {
  return input.isByok || input.freeLeft > 0 ? 0 : ASK_RESERVE_CREDITS;
}

export interface AskSettlement {
  routed: boolean;
  free: boolean;
  /** Whole credits charged. */
  credits: number;
  freeLeft: number;
}

/**
 * Settles a kept turn on the ledger and answers what the browser is told. Called only once the turn is saved, so a
 * turn that was not kept takes no free answer and no credit.
 */
export async function settleAnswer(input: {
  userId: string;
  routed: boolean;
  isByok: boolean;
  /** The turn's exact measured credits; 0 for own-key use. */
  accrued: number;
  /** Free answers left before this turn. */
  freeLeft: number;
  ledger: JobLedger;
  log: CreditLogFields;
  chargeAnswer(userId: string, credits: number): Promise<AskCharge>;
}): Promise<AskSettlement> {
  const { ledger, log, isByok } = input;
  if (input.routed) {
    // A cost of 0 is written as a free line (or an own-key zero row): the tokens were spent, the DM is not charged.
    ledger.charge("ask_routing", { cost: 0, isByok, log });
    return { routed: true, free: false, credits: 0, freeLeft: input.freeLeft };
  }
  if (isByok) {
    ledger.charge("ask_answer", { cost: 0, isByok: true, log });
    return { routed: false, free: false, credits: 0, freeLeft: input.freeLeft };
  }
  let charge: AskCharge;
  try {
    charge = await input.chargeAnswer(input.userId, input.accrued);
  } catch (error) {
    // The answer is already kept and shown. Failing to meter it must cost the platform, never the DM, and never the answer.
    console.error("ask-turn: settling the answer failed:", error);
    ledger.free("ask_answer", log);
    return { routed: false, free: true, credits: 0, freeLeft: input.freeLeft };
  }
  ledger.charge("ask_answer", { cost: charge.credits, isByok: false, log });
  return { routed: false, free: charge.free, credits: charge.credits, freeLeft: charge.freeLeft };
}
