import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

/**
 * True when the user currently has an active/trialing paid subscription
 * (mirrors the SQL is_user_pro(): plan_id in pro|tester, status active|trialing).
 *
 * BYOK is Pro-only. Generators use this to decide whether a campaign's stored
 * API key may be honored: enforcing at generation time (not just at write time)
 * means a lapsed-Pro user's previously-saved key stops being treated as BYOK —
 * non-destructively, so re-subscribing restores it, and a transient Stripe
 * dunning blip never deletes the stored key.
 *
 * Call with the service-role client (RLS does not apply).
 */
export async function isUserPro(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("user_subscriptions")
    .select("plan_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;
  const row = data as { plan_id: string; status: string };
  return ["active", "trialing"].includes(row.status) && ["pro", "tester"].includes(row.plan_id);
}
