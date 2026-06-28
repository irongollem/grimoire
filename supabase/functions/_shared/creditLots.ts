/**
 * FIFO credit-lot accounting computed on read.
 *
 * The `ai_credit_ledger` is append-only and fungible (balance = sum(delta)), so
 * nothing intrinsically links a spend to the grant it drew from. For refund
 * eligibility we need per-pack traceability: "is THIS pack still unspent?".
 *
 * We reconstruct it by treating purchased-bucket grants as FIFO lots (oldest
 * consumed first) and replaying genuine purchased spend across them. No schema
 * change, no change to the spend hot path — the ledger remains the source of
 * truth and this is a pure projection over it.
 *
 * A refund clawback (`reason = 'pack_refund'`) is NOT a spend: it reverses one
 * specific pack. Such packs are removed from the FIFO stack entirely (both their
 * grant and their clawback are ignored) so other packs' remaining is unaffected.
 */

export interface LedgerRowLite {
  id: string;
  delta: number;
  reason: string;
  bucket: string;
  pending: boolean;
  created_at: string;
  stripe_payment_intent_id: string | null;
  /** Set only on `pack_refund` rows — the purchase PI this clawback reverses. */
  refunded_payment_intent_id?: string | null;
}

export interface PackLot {
  paymentIntentId: string;
  /** Credits granted by the pack. */
  credits: number;
  purchasedAt: string;
  /** FIFO-computed credits still unspent from this pack (0 if refunded). */
  remaining: number;
  /** credits - remaining. */
  consumed: number;
  alreadyRefunded: boolean;
  /** Purchased within the refund window (default 14 days). */
  withinWindow: boolean;
  /** Policy-eligible: untouched, in-window, not already refunded. */
  eligible: boolean;
}

const DAY_MS = 86_400_000;

/** True for a real purchased-credit consumption (not a hold, not a refund). */
function isGenuinePurchasedSpend(r: LedgerRowLite): boolean {
  return r.bucket === "purchased" && r.delta < 0 && !r.pending && r.reason !== "pack_refund";
}

/** True for a positive purchased grant (pack purchase or admin grant). */
function isPurchasedGrant(r: LedgerRowLite): boolean {
  return r.bucket === "purchased" && r.delta > 0;
}

/**
 * Project the ledger into per-pack refund eligibility.
 * @param rows  all ledger rows for ONE user (any order)
 * @param nowMs current time in ms (passed in — Deno scripts can't call Date.now() freely)
 */
export function computePackLots(
  rows: LedgerRowLite[],
  nowMs: number,
  windowDays = 14,
): PackLot[] {
  const refundedPIs = new Set(
    rows
      .filter((r) => r.reason === "pack_refund" && r.refunded_payment_intent_id)
      .map((r) => r.refunded_payment_intent_id as string),
  );

  const genuineSpend = rows
    .filter(isGenuinePurchasedSpend)
    .reduce((sum, r) => sum + -r.delta, 0);

  // FIFO stack: positive purchased grants, oldest first, excluding refunded packs.
  const fifoLots = rows
    .filter(isPurchasedGrant)
    .filter((r) => !(r.stripe_payment_intent_id && refundedPIs.has(r.stripe_payment_intent_id)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Walk lots oldest→newest, consuming the genuine spend total.
  let spendLeft = genuineSpend;
  const remainingByPI = new Map<string, number>();
  for (const lot of fifoLots) {
    const consumed = Math.min(spendLeft, lot.delta);
    spendLeft -= consumed;
    if (lot.stripe_payment_intent_id) {
      remainingByPI.set(lot.stripe_payment_intent_id, lot.delta - consumed);
    }
  }

  // Output every pack purchase (newest first for display), refunded ones included.
  return rows
    .filter((r) => r.reason === "pack_purchase" && r.stripe_payment_intent_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => {
      const pi = r.stripe_payment_intent_id as string;
      const credits = r.delta;
      const alreadyRefunded = refundedPIs.has(pi);
      const remaining = alreadyRefunded ? 0 : remainingByPI.get(pi) ?? credits;
      const withinWindow = nowMs - new Date(r.created_at).getTime() <= windowDays * DAY_MS;
      return {
        paymentIntentId: pi,
        credits,
        purchasedAt: r.created_at,
        remaining,
        consumed: credits - remaining,
        alreadyRefunded,
        withinWindow,
        eligible: !alreadyRefunded && withinWindow && remaining === credits,
      };
    });
}

/**
 * Credits to claw back when refunding a pack, clamped so the user's purchased
 * balance can never go negative. Eligible packs claw back the full amount;
 * partly-spent override refunds claw back only what's left available.
 */
export function clawbackAmount(packCredits: number, purchasedBalance: number): number {
  return Math.max(0, Math.min(packCredits, purchasedBalance));
}
