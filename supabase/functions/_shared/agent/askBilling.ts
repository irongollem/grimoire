// What an Ask answer costs and who pays (#1253), the maintainer's decision of 23 Nov 2026 in rules:
//
//   - A turn that ends at a proposal is routed. It is not charged when it ends: it is written as pending
//     (`ask_pending_routes`) with its exact credits. It is free only when the DM runs the generator: at their next
//     Ask turn `settle_ask_routes` confirms each route against a generation charged after it (its routing is inside
//     that generator's price), and meters every other one as an answer (a free answer if one is left, else whole
//     credits, the fraction carried). "We're offering a tool to work with your campaign, not to ideate": without
//     this a proposal was an unlimited free answer. Its measured cost is still written as a free ledger line
//     (`ask_routing`), so what routing costs can be measured.
//   - Any other turn is an answer. The first five a day are free per account; after that an answer is charged from
//     its measured tokens in whole credits, the fraction carried to the next answer. `charge_ask_answer` decides
//     which, under a row lock, so two answers finishing together cannot both take the last free one.
//   - Own-key use is never metered, charged or counted.
//
// Before the stream opens the account must be able to pay for a charged answer: a free one is left, or a credit
// can be held. Pure: the database comes in as functions.

import { FREE_ASKS_PER_DAY } from "./askContract.ts";
import type { AskCharge, AskRouteSettlement } from "./askTypes.ts";
import { ASK_RESERVE_CREDITS } from "./askTypes.ts";
import type { CreditLogFields } from "../credits.ts";
import type { JobLedger } from "../pipeline/creditHold.ts";

/**
 * Settles the account's earlier routed turns at admission. An own-key account never calls it (its routes are never
 * written). A failure is logged and answers as if nothing was owed: the routes stay open for next time, and the DM is
 * never blocked on bookkeeping. The free answers are then assumed all left, which is only the hold's precheck:
 * `charge_ask_answer` still decides, under its lock, whether the answer is free.
 */
export async function settleEarlierRoutes(input: {
  userId: string;
  isByok: boolean;
  settleRoutes(userId: string): Promise<AskRouteSettlement>;
}): Promise<AskRouteSettlement> {
  if (input.isByok) return { credits: 0, freeLeft: 0 };
  try {
    return await input.settleRoutes(input.userId);
  } catch (error) {
    console.error("ask-turn: settling earlier routed turns failed:", error);
    return { credits: 0, freeLeft: FREE_ASKS_PER_DAY };
  }
}

/** Spends the credits settlement said were owed, through the hold's ledger. Nothing when none are. */
export function spendOwedRoutes(ledger: JobLedger, owed: number): void {
  if (owed > 0) ledger.charge("ask_answer", { cost: owed, isByok: false, log: {} });
}

/**
 * What to hold before the turn: the whole credits settlement says are owed, plus one for this answer when no free
 * one is left. Nothing for an own key, whose routes are never written and so are never owed.
 */
export function reserveFor(input: { freeLeft: number; owed: number; isByok: boolean }): number {
  if (input.isByok) return 0;
  return input.owed + (input.freeLeft > 0 ? 0 : ASK_RESERVE_CREDITS);
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
