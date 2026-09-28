/**
 * Account-standing gate for generation edge functions: a frozen account and a
 * child account (#919) must never generate, and a child must never spend
 * credits. This module replaces `suspension.ts`, which held only the freeze
 * half — the two checks are folded together here so every generator asks
 * both questions the same way (`generationRefusal`), rather than growing two
 * parallel gates that drift apart.
 *
 * SUSPENSION (carried over unchanged from suspension.ts). A soft freeze
 * (`user_subscriptions.suspended_at`, set on chargeback / fraud / admin
 * action) is normally enforced inside `reserve_credits`. But that RPC — and
 * its TS wrapper `reserveCredits` — short-circuit on `cost <= 0` BEFORE the
 * suspension branch, so a BYOK generation (cost 0) skips the freeze entirely.
 * A frozen Pro account could therefore keep generating on its own API keys.
 * Generators call `isAccountSuspended` before any provider work so the freeze
 * covers BYOK and platform paths alike (defense in depth; the paid path is
 * still separately gated by reserve_credits).
 *
 * Fails OPEN (returns false) on a query error: a transient DB blip must not
 * block a legitimate user, and the paid path remains gated by the RPC. A
 * freeze is a rare, deliberate action, so the exposure of failing open is
 * bounded.
 *
 * CHILD (#919). An active child account — a `child_accounts` row for the
 * caller with `adult_on > current_date` — must never reach an AI provider.
 * `private.is_child_account` is the canonical predicate, but it lives in the
 * non-exposed `private` schema and is revoked from every client role on
 * purpose (see migration 20260928053257_child_accounts.sql), so this module
 * queries `child_accounts` directly with the service-role client instead of
 * calling it.
 *
 * `isChildAccount` throws on a query error rather than swallowing it, unlike
 * `isAccountSuspended` — this check has two very different call-site risk
 * profiles (a generator wants fail-open, a purchase or link-shareable-surface
 * endpoint wants fail-closed), so the decision belongs at the call site, not
 * baked into the helper.
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
 * CORS headers are applied uniformly by the `withCors` wrapper, not here.
 */
export function suspendedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "account_suspended" }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * True when `userId` is an active (not yet 16) child account: a
 * `child_accounts` row exists for them with `adult_on` in the future. Throws
 * on a query error — see the module header for why the fail-open/fail-closed
 * choice is left to the caller.
 */
export async function isChildAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("child_accounts")
    .select("child_user_id")
    .eq("child_user_id", userId)
    .gt("adult_on", today)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/**
 * Standard 403 for a child account. Same shape as `suspendedResponse` so
 * every caller handles account-standing refusals uniformly.
 * CORS headers are applied uniformly by the `withCors` wrapper, not here.
 */
export function childAccountResponse(): Response {
  return new Response(
    JSON.stringify({ error: "child_account" }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * The one call every generation edge function makes, right after auth:
 * suspended -> `suspendedResponse()`, active child -> `childAccountResponse()`,
 * else `null` (proceed). Both lookups run in parallel.
 *
 * Fails OPEN on a query error for either check — same rationale as
 * `isAccountSuspended` alone, plus one more for the child half: even if this
 * gate misses a child account on a transient DB blip, the platform-credit
 * path is independently refused by `assert_spend_allowed` (which raises
 * `child_account` before the velocity check, inside `reserve_credits` /
 * `spend_credits`), and the bring-your-own-key path requires Pro, which
 * `is_user_pro` denies to a child and which itself fails CLOSED on a query
 * error. So a miss here is caught by a check downstream that does not miss.
 *
 * That argument needs a downstream check. A caller whose AI call is free
 * (embeddings) has none, and passes `failClosed: true` instead.
 */
export async function generationRefusal(
  admin: SupabaseClient,
  userId: string,
  { failClosed = false }: { failClosed?: boolean } = {},
): Promise<Response | null> {
  const [suspended, child] = await Promise.all([
    isAccountSuspended(admin, userId),
    isChildAccount(admin, userId).catch((e: unknown): boolean | "unknown" => {
      console.error("child-account check failed:", e);
      return failClosed ? "unknown" : false;
    }),
  ]);
  if (suspended) return suspendedResponse();
  if (child === "unknown") return accountCheckFailedResponse();
  if (child) return childAccountResponse();
  return null;
}

/**
 * 503 for a caller whose child-account status could not be read. Only
 * returned with `failClosed`, for a caller that reaches a provider with no
 * credit or Pro check behind this one (free embeddings: import-match).
 */
export function accountCheckFailedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "account_check_failed" }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}
