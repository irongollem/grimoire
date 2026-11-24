import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when the user holds Pro-equivalent privileges: a paid 'pro'/'tester'
 * subscription (active/trialing) OR app-admin role. Delegates to the SQL
 * is_user_pro() so admin/tester/pro equivalence lives in exactly one place.
 *
 * Call with the service-role client. Fails closed (returns false) if the RPC errors.
 */
export async function isUserPro(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("is_user_pro", { p_user_id: userId });
  if (error) {
    console.error("is_user_pro check failed:", error.message);
    return false;
  }
  return data === true;
}
