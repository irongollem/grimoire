/**
 * Account-freeze gate for generation edge functions.
 *
 * A soft freeze (`user_subscriptions.suspended_at`, set on chargeback / fraud /
 * admin action) is normally enforced inside `reserve_credits`. But that RPC —
 * and its TS wrapper `reserveCredits` — short-circuit on `cost <= 0` BEFORE the
 * suspension branch, so a BYOK generation (cost 0) skips the freeze entirely.
 * A frozen Pro account could therefore keep generating on its own API keys.
 *
 * Generators call `isAccountSuspended` before any provider work so the freeze
 * covers BYOK and platform paths alike (defense in depth; the paid path is still
 * separately gated by reserve_credits).
 *
 * Fails OPEN (returns false) on a query error: a transient DB blip must not
 * block a legitimate user, and the paid path remains gated by the RPC. A freeze
 * is a rare, deliberate action, so the exposure of failing open is bounded.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function isAccountSuspended(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("suspended_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("suspension check failed:", error.message);
    return false;
  }
  return !!(data as { suspended_at: string | null } | null)?.suspended_at;
}

/**
 * Standard 403 for a frozen account. Mirrors the `account_suspended` shape
 * `reservationFailureResponse` returns so the client sees one consistent error.
 */
export function suspendedResponse(cors: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "account_suspended" }),
    { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
  );
}
