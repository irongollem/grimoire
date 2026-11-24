// What an Ask answer costs and who pays (#1253), the maintainer's decision of 23 Nov 2026 in rules:
//
//   - A turn that ends at a proposal is routed. It is not charged when it ends: it is written as pending
//     (`ask_pending_routes`) with its exact credits. It is free only when the DM runs the generator: at their next
//     Ask turn `settle_ask_routes` confirms each route against a generation charged after it (its routing is inside
//     that generator's price), and meters every other one as an answer (a free answer if one is left, else whole
//     credits, the fraction carried, and charged there and then). "We're offering a tool to work with your campaign, not to ideate": without
//     this a proposal was an unlimited free answer. Its measured cost is still written as a free ledger line
//     (`ask_routing`), so what routing costs can be measured.
//   - Any other turn is an answer. The first five a day are free per account; after that an answer is charged from
//     its measured tokens in whole credits, the fraction carried to the next answer. `charge_ask_answer` decides
//     which, under a row lock, so two answers finishing together cannot both take the last free one.
//
// Before the stream opens the account must be able to pay for a charged answer: a free one is left, or a credit
// can be held. Pure: the database comes in as functions.

import { FREE_ASKS_PER_DAY } from "./askContract.ts";
import type { AskCharge, AskRouteSettlement } from "./askTypes.ts";
import { ASK_RESERVE_CREDITS } from "./askTypes.ts";
import type { CreditLogFields } from "../credits.ts";
import type { JobLedger } from "../pipeline/creditHold.ts";

/**
 * Settles the account's earlier routed turns at admission. A failure is logged and answers as if nothing was owed: the routes stay open for next time, and the DM is
 * never blocked on bookkeeping. The free answers are then assumed all left, which is only the hold's precheck:
 * `charge_ask_answer` still decides, under its lock, whether the answer is free.
 */
export async function settleEarlierRoutes(input: {
  userId: string;
  settleRoutes(userId: string): Promise<AskRouteSettlement>;
}): Promise<AskRouteSettlement> {
  try {
    return await input.settleRoutes(input.userId);
  } catch (error) {
    console.error("ask-turn: settling earlier routed turns failed:", error);
    return { credits: 0, freeLeft: FREE_ASKS_PER_DAY };
  }
}

/**
 * What to hold before the turn: one credit for this answer when no free one is left, else nothing. What earlier
 * routes owed is not held: `settle_ask_routes` charges it itself, in the transaction that removes them, so a refused
 * hold cannot lose it.
 */
export function reserveFor(input: { freeLeft: number }): number {
  return input.freeLeft > 0 ? 0 : ASK_RESERVE_CREDITS;
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
  /** The turn's exact measured credits. */
  accrued: number;
  /** Free answers left before this turn. */
  freeLeft: number;
  ledger: JobLedger;
  log: CreditLogFields;
  chargeAnswer(userId: string, credits: number): Promise<AskCharge>;
}): Promise<AskSettlement> {
  const { ledger, log } = input;
  if (input.routed) {
    // A cost of 0 is written as a free line: the tokens were spent, the DM is not charged.
    ledger.charge("ask_routing", { cost: 0, log });
    return { routed: true, free: false, credits: 0, freeLeft: input.freeLeft };
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
  ledger.charge("ask_answer", { cost: charge.credits, log });
  return { routed: false, free: charge.free, credits: charge.credits, freeLeft: charge.freeLeft };
}
