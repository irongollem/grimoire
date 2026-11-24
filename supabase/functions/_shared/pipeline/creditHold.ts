// The one way an edge function holds and settles credits (#1234).
//
// Every paid generation used to wire `reserveCredits` -> model -> `releaseCredits` -> `recordGeneration` by hand, and
// the 20 Nov 2026 audit found the copies leaking in three ways:
//
//   1. A throw between the reserve and the `try` that releases (a `JSON.parse` of the model's reply, an awaited
//      quality read, a prompt builder) left the hold in place until the two-hour stale-hold sweep, so the user's
//      balance read short for two hours.
//   2. A throw after the release (a ledger write, a provenance mark) landed in a catch that released again and
//      answered 502 for a result that had been made and paid for.
//   3. `recordGeneration(..., cost=0)` writes nothing, so platform-paid side calls vanished from the
//      cost reports.
//
// So the hold is a scope. `withCreditHold` reserves, runs the work, and releases exactly once in `finally`, whatever
// the work did. Ledger lines are queued on the hold and written after the release, never in the work's own error
// path; a ledger write that fails is reported and logged, and never turns an answer into an error. If the work throws,
// its queued charges are written as free lines instead: the platform's spend stays visible, and the user, who got an
// error, is not charged. Nothing outside this file calls `reserveCredits`, `releaseCredits` or `recordGeneration`
// (`creditHoldOnly.test.ts`).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type CreditLogFields,
  recordFreeGeneration,
  recordGeneration,
  releaseCredits,
  reservationFailureResponse,
  reserveCredits,
} from "../credits.ts";

export interface ChargeLine {
  /** Whole credits to charge; 0 for a free call. */
  cost: number;
  log?: CreditLogFields;
}

export interface CreditHold {
  /** What is held, in credits; 0 when nothing is (a free request). */
  readonly held: number;
  /**
   * Queue a ledger line for work that succeeded. Several lines may come from one hold (a trap's text and its picture
   * are two rows). A line with cost 0 is written as a free line, since a zero spend writes nothing.
   */
  charge(reason: string, line: ChargeLine): void;
  /** Queue a platform-paid line that costs the user nothing (an embedding, a judgement), so the spend stays visible. */
  free(reason: string, log?: CreditLogFields): void;
  /**
   * Pass the hold to a background job that settles it itself (an image job, the music job): the ids it must release.
   * After this the scope releases nothing and takes no more lines.
   */
  handOff(): string[];
}

export interface CreditHoldOptions {
  /** Whose credits are held; the caller, except where the campaign's owner pays (a character's reply). */
  payerId: string;
  /** The ledger reason the hold is taken under. */
  reason: string;
  /** Whole credits to hold; 0 holds nothing and still runs the work. */
  cost: number;
  /** Where a ledger write that failed after the answer was made is sent (Sentry, from `serveUser`). */
  report?: (err: unknown) => void;
}

type Line = { kind: "charge"; reason: string; line: ChargeLine } | { kind: "free"; reason: string; log?: CreditLogFields };

async function write(admin: SupabaseClient, payerId: string, entry: Line, workFailed: boolean): Promise<void> {
  if (entry.kind === "free") return recordFreeGeneration(admin, payerId, entry.reason, entry.log);
  const { reason, line } = entry;
  if (workFailed || line.cost <= 0) return recordFreeGeneration(admin, payerId, reason, line.log);
  return recordGeneration(admin, payerId, reason, line.cost, line.log);
}

async function settle(
  admin: SupabaseClient,
  payerId: string,
  release: string[],
  lines: Line[],
  workFailed: boolean,
  report: ((err: unknown) => void) | undefined,
): Promise<void> {
  await releaseCredits(admin, release);
  for (const entry of lines) {
    try {
      await write(admin, payerId, entry, workFailed);
    } catch (e) {
      console.error(`ledger write failed (${entry.reason}):`, e);
      report?.(e);
    }
  }
}

export async function withCreditHold(
  admin: SupabaseClient,
  { payerId, reason, cost, report }: CreditHoldOptions,
  work: (hold: CreditHold) => Promise<Response>,
): Promise<Response> {
  const reservation = await reserveCredits(admin, payerId, cost, reason);
  if (!reservation.ok) return reservationFailureResponse(reservation);

  const lines: Line[] = [];
  let handedOff = false;
  let settled = false;
  const open = (what: string) => {
    if (settled || handedOff) throw new Error(`credit hold "${reason}": ${what} after the hold was settled`);
  };

  const hold: CreditHold = {
    held: Math.max(0, cost),
    charge(lineReason, line) {
      open("charge");
      lines.push({ kind: "charge", reason: lineReason, line });
    },
    free(lineReason, log) {
      open("free");
      lines.push({ kind: "free", reason: lineReason, log });
    },
    handOff() {
      open("handOff");
      handedOff = true;
      return reservation.ids;
    },
  };

  let workFailed = false;
  try {
    return await work(hold);
  } catch (e) {
    workFailed = true;
    throw e;
  } finally {
    settled = true;
    await settle(admin, payerId, handedOff ? [] : reservation.ids, lines, workFailed, report);
  }
}

/** The ledger a background job writes to: the same lines as a hold, without the hand-off. */
export type JobLedger = Pick<CreditHold, "charge" | "free">;

/**
 * The background half of a handed-off hold (`hold.handOff()`), for the worker that does the paid work after the
 * request has been answered (an image job under `EdgeRuntime.waitUntil`). Same rules as `withCreditHold`: the ids are
 * released exactly once in `finally`, lines are written after the release, and the charges of work that threw are
 * written free.
 *
 * The work ends when the result is **stored and charged**. Job bookkeeping after that (`completeImageJob`) belongs
 * outside this scope: a failure there must not turn a delivered, paid result into "failed, not charged", which is what
 * the hand-wired workers did (generate-character-doll, generate-chronicle-image, #1234).
 */
export async function settleHandedOff<T>(
  admin: SupabaseClient,
  { payerId, ids, report }: { payerId: string; ids: string[]; report?: (err: unknown) => void },
  work: (ledger: JobLedger) => Promise<T>,
): Promise<T> {
  const lines: Line[] = [];
  let settled = false;
  const ledger: JobLedger = {
    charge(lineReason, line) {
      if (settled) throw new Error(`job ledger: charge "${lineReason}" after settling`);
      lines.push({ kind: "charge", reason: lineReason, line });
    },
    free(lineReason, log) {
      if (settled) throw new Error(`job ledger: free "${lineReason}" after settling`);
      lines.push({ kind: "free", reason: lineReason, log });
    },
  };
  let workFailed = false;
  try {
    return await work(ledger);
  } catch (e) {
    workFailed = true;
    throw e;
  } finally {
    settled = true;
    await settle(admin, payerId, ids, lines, workFailed, report);
  }
}
