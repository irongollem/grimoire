import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

/**
 * True when the user holds Pro-equivalent privileges: a paid 'pro'/'tester'
 * subscription (active/trialing) OR app-admin role. Delegates to the SQL
 * is_user_pro() so admin/tester/pro equivalence lives in exactly one place.
 *
 * BYOK is Pro-only. Generators use this to decide whether a campaign's stored
 * API key may be honored: enforcing at generation time (not just at write time)
 * means a lapsed-Pro user's previously-saved key stops being treated as BYOK —
 * non-destructively, so re-subscribing restores it, and a transient Stripe
 * dunning blip never deletes the stored key.
 *
 * Call with the service-role client. Fails closed (returns false → charge
 * credits) if the RPC errors.
 */
export async function isUserPro(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("is_user_pro", { p_user_id: userId });
  if (error) {
    console.error("is_user_pro check failed:", error.message);
    return false;
  }
  return data === true;
}
