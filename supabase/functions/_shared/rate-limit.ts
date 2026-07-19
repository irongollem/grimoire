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
