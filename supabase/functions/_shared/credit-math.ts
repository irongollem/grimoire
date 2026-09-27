/**
 * Pure credit math — NO imports, no Deno/Node deps — so it can be unit-tested by
 * vitest (Node) AND imported by the Deno edge functions. This is billing-critical
 * logic; keep it pure and exhaustively tested in credit-math.test.ts.
 */

/**
 * Credit multiplier for an image render by pixel area, relative to a 1024×1024
 * square (= 1.0). A 1536×1024 / 1024×1536 render is 1.5×. Output-image tokens —
 * and real cost — scale with area, so non-square renders are charged
 * proportionally. Returns 1 for unknown/blank sizes (text, fixed-square).
 */
export function sizeMultiplier(size: string | null | undefined): number {
  if (!size) return 1;
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(size.trim());
  if (!m) return 1;
  const area = Number(m[1]) * Number(m[2]);
  if (!Number.isFinite(area) || area <= 0) return 1;
  return area / (1024 * 1024);
}

/**
 * The single place a charge becomes a whole number of credits. Every AI
 * generation charges a whole number, rounded UP — a provider multiplier
 * (e.g. OpenAI images at 0.35×) or a size multiplier (1.5× portrait/landscape)
 * routinely produces a fractional product (60 × 0.35 × 1.5 = 31.5), and the
 * decision is to never bill or display a fraction of a credit for it. Rounding
 * up (not to nearest) means the platform never eats the remainder.
 *
 * The `- 1e-9` epsilon absorbs float noise from the multiplication chain
 * (e.g. an input that is mathematically exactly 21 but represented as
 * 21.000000000000004) so it does not spuriously round up a whole step to 22.
 * A cost of 0 (free/infrastructure rows) stays 0, and the result is never
 * negative.
 */
export function wholeCredits(raw: number): number {
  if (raw <= 0) return 0;
  return Math.ceil(raw - 1e-9);
}

/**
 * Allocate a spend across the two buckets, subscription-first (burn the expiring
 * monthly allowance before permanent purchased credits). A negative subscription
 * balance (transient concurrent over-draw) is treated as 0 so we never "refund"
 * by drawing a negative amount. Caller is responsible for the total-balance
 * pre-flight check; this only decides the split.
 */
export function splitSpend(
  cost: number,
  subscriptionBalance: number,
): { subSpend: number; purSpend: number } {
  if (cost <= 0) return { subSpend: 0, purSpend: 0 };
  const sub = Math.max(0, subscriptionBalance);
  const subSpend = Math.min(cost, sub);
  return { subSpend, purSpend: cost - subSpend };
}

/**
 * The ledger delta that resets the subscription bucket to exactly `allowance`
 * for a new billing period (use-it-or-lose-it). Works whether the current
 * bucket sum is positive (unused credits expire) or negative (over-draw is
 * cleared). Written as a single per-period row that doubles as the idempotency
 * marker, so it must always be inserted — even when the delta is 0.
 */
export function resetDelta(allowance: number, currentSubscriptionBalance: number): number {
  return allowance - currentSubscriptionBalance;
}
