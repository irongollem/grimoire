/**
 * Credit deduction helpers for server-side generation edge functions.
 * BYOK calls log delta=0 (user pays their own API bill).
 * Platform-key calls deduct from the user's credit balance.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

export interface CreditLogFields {
  model?: string;
  provider?: string;
  input_tokens?: number;
  output_tokens?: number;
  image_count?: number;
}

export async function fetchCreditCost(
  admin: SupabaseClient,
  generationType: string,
): Promise<number> {
  const { data } = await admin
    .from("ai_generation_credit_costs")
    .select("credit_cost")
    .eq("generation_type", generationType)
    .maybeSingle();
  return (data as { credit_cost: number } | null)?.credit_cost ?? 1;
}

export async function fetchUserBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data } = await admin
    .from("ai_credit_balance")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { balance: number } | null)?.balance ?? 0;
}

/**
 * Records a generation in the ledger.
 * - isByok=true  → delta=0  (analytics only, user pays their own API bill)
 * - isByok=false → delta=-cost (deducts from platform-key user's credit balance)
 */
export async function recordGeneration(
  admin: SupabaseClient,
  userId: string,
  generationType: string,
  isByok: boolean,
  cost: number,
  logFields: CreditLogFields = {},
): Promise<void> {
  const { error } = await admin.from("ai_credit_ledger").insert({
    user_id: userId,
    delta: isByok ? 0 : -cost,
    reason: generationType,
    is_byok: isByok,
    ...logFields,
  });
  if (error) console.error(`Failed to record generation (${generationType}):`, error);
}
