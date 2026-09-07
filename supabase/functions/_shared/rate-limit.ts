/**
 * Per-user, per-action rate limiting (issue #466). Thin wrapper over the
 * check_rate_limit() RPC, which atomically counts a user's events in the
 * trailing window and records the new one. Returns true when the request is
 * allowed (and recorded), false when the limit is hit.
 *
 * Fail closed on infrastructure error. These gates protect paid vendor calls
 * and an issue-writing token; temporarily rejecting a request is safer than
 * silently removing the only burst bound when the database is unhealthy.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared budgets. AI generation is bucketed across all generators so the total
// paid-call burst is bounded; the bug reporter has its own daily cap.
export const RATE_LIMITS = {
  ai_generation: { action: "ai_generation", limit: 30, windowSeconds: 60 },
  bug_report:    { action: "bug_report",    limit: 15, windowSeconds: 86_400 },
  // One event per notify invocation (which may email a whole party). Bounds a
  // compromised or misbehaving DM account to 30 email bursts an hour.
  email_notify:  { action: "email_notify",  limit: 30, windowSeconds: 3_600 },
  // GDPR export (#632). Reads every table in the database for one account, so
  // it is the app's most expensive single read — and on a stolen session it is
  // the fastest route to a whole account in one file. Deliberately generous
  // enough that a real person never notices (a retry, a second thought, a
  // re-download) and tight enough that it cannot be used as a bulk-read loop.
  // A denied request costs the subject a wait, never the right: Art. 12(3)
  // allows a month, and this resets in an hour.
  data_export:   { action: "data_export",   limit: 5,  windowSeconds: 3_600 },
  /**
   * Embedding (#841 follow-up). Deliberately its own bucket rather than a
   * share of `ai_generation`: embed-on-write fires on every entity save, so
   * spending the generation budget here would exhaust a DM's quota on
   * something they never asked for and never see — the reason embed-content
   * and embed-monsters previously carried *no* limit at all.
   *
   * Those functions justified having none by pointing at the per-entity quota
   * "that already caps how many monsters a user can create". That is true on
   * free (10 NPCs, 10 locations, 3 monsters) and false on Pro, whose `quotas`
   * is `{}` — so a Pro account editing in a loop had no ceiling whatsoever.
   *
   * The money at risk was never the point: `text-embedding-3-small` is $0.02
   * per 1M tokens, production's entire 2,891-entity corpus cost under one euro
   * cent, and a joker would need ~3.3M embeds to spend €10 of ours. What this
   * bounds is a runaway loop — a broken client, a script — and it replaces
   * "unbounded" with a number.
   *
   * 2,000 a day is far above any real use: the largest single campaign here
   * has ~200 unindexed rows, and a heavy prep day saves a few dozen entities.
   * A corpus bigger than 2,000 finishes the next day, which the client says
   * out loud rather than reporting as failure.
   */
  entity_embedding: { action: "entity_embedding", limit: 2_000, windowSeconds: 86_400 },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export async function checkRateLimit(
  admin: SupabaseClient,
  userId: string,
  key: RateLimitKey,
): Promise<boolean> {
  const { action, limit, windowSeconds } = RATE_LIMITS[key];
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_user_id: userId,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`check_rate_limit(${action}) failed — rejecting request:`, error);
    return false;
  }
  return data === true;
}
