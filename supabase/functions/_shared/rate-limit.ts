/**
 * Per-user, per-action rate limiting (issue #466). Thin wrapper over the
 * check_rate_limit() RPC, which atomically counts a user's events in the
 * trailing window and records the new one. Returns true when the request is
 * allowed (and recorded), false when the limit is hit.
 *
 * Fail-OPEN on infrastructure error: rate limiting is defense-in-depth, so a DB
 * hiccup must not block a paying user's legitimate generation. The error is
 * logged for visibility.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

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
    console.error(`check_rate_limit(${action}) failed — allowing request:`, error);
    return true; // fail-open
  }
  return data === true;
}
