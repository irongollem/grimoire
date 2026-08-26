// The attempt budget for a generated tile-pack slot (#384).
//
// A slot is bought once and its attempts are the product: a user cannot judge a
// tile until they see it, and metering that judgement makes them keep work they
// do not want. "Free retries" only survives contact with a billing ledger if it
// has a ceiling, so the ceiling and the charge are decided in one place.
//
// Pure and exhaustively tested for the same reason credit-math.ts is — this
// decides what a user is charged. It lives here rather than in the edge
// function's `_shared` because the manager view needs the same number to label
// its Retry button, and the dependency runs edge -> src, never back.
//
// The price that pays for this budget is `tile_pack_generation` in
// `ai_generation_credit_costs` (12 credits); migration 20260826213049 records
// how it was derived and what would move it.

/** One paid attempt plus three free retries. */
export const MAX_GENERATION_ATTEMPTS = 4;

/** Whether another provider call is allowed for a slot. */
export function canAttempt(attemptsSoFar: number): boolean {
  return attemptsSoFar < MAX_GENERATION_ATTEMPTS;
}

/** Attempts left before the slot must be accepted or abandoned. */
export function attemptsRemaining(attemptsSoFar: number): number {
  return Math.max(0, MAX_GENERATION_ATTEMPTS - attemptsSoFar);
}

/**
 * Credits to reserve for the next attempt: the full rate on the first, nothing
 * after. A provider call that errors never reaches the caller's increment, so
 * our own failures do not consume the budget the user paid for.
 */
export function attemptCharge(baseCost: number, attemptsSoFar: number): number {
  if (!canAttempt(attemptsSoFar)) return 0;
  return attemptsSoFar === 0 ? baseCost : 0;
}
