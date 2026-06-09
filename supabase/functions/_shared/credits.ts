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
  input_image_tokens?: number;
  output_tokens?: number;
  image_count?: number;
}

let costCache: Map<string, number> | null = null;
let costCacheExpiry = 0;
const COST_TTL_MS = 5 * 60 * 1000;

/**
 * Credit multiplier for an image render based on its pixel area, relative to a
 * 1024×1024 square baseline (= 1.0). A 1536×1024 / 1024×1536 render is 1.5×.
 * Output-image tokens — and therefore real cost — scale with output area, so
 * non-square renders are charged proportionally. Returns 1 for unknown/blank
 * sizes (text generations, fixed-square functions).
 */
export function sizeMultiplier(size: string | null | undefined): number {
  if (!size) return 1;
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(size.trim());
  if (!m) return 1;
  const area = Number(m[1]) * Number(m[2]);
  if (!Number.isFinite(area) || area <= 0) return 1;
  return area / (1024 * 1024);
}

export async function fetchCreditCost(
  admin: SupabaseClient,
  generationType: string,
): Promise<number> {
  if (!costCache || Date.now() >= costCacheExpiry) {
    const { data } = await admin
      .from("ai_generation_credit_costs")
      .select("generation_type, credit_cost");
    costCache = new Map(
      (data ?? []).map((row: { generation_type: string; credit_cost: number }) => [
        row.generation_type,
        row.credit_cost,
      ]),
    );
    costCacheExpiry = Date.now() + COST_TTL_MS;
  }
  return costCache.get(generationType) ?? 1;
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
