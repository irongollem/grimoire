/**
 * Server backstop for the EU AI Act Art 50(1) likeness consent gate (see
 * context/compliance/provenance-architecture.md §3). Every portrait-bearing
 * generator (forge-mini stylize/sculpt, generate-chronicle-image when the
 * request carries portrait references) calls this BEFORE any provider work
 * or credit reservation. The client pre-flights the identical check via
 * `useLikenessGate`, so this should rarely actually block — it exists to
 * close the direct-API-call gap the client can't guard, same pattern as
 * `isAccountSuspended` (../suspension.ts).
 *
 * Deno-only (imports the supabase-js admin client type) — deliberately a
 * separate file from ./consent.ts, which stays pure TS so the browser can
 * import its version constants via the @edge-shared alias.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_LIKENESS_NOTICE_VERSION } from "./consent.ts";

export async function hasLikenessAcknowledgement(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("ai_acknowledgements")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "likeness")
    .eq("version", AI_LIKENESS_NOTICE_VERSION)
    .maybeSingle();
  return !!data;
}
