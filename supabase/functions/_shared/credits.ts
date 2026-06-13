/**
 * Credit deduction helpers for server-side generation edge functions.
 * BYOK calls log delta=0 (user pays their own API bill).
 * Platform-key calls deduct from the user's credit balance.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { splitSpend, sizeMultiplier as sizeMultiplierMath } from "./credit-math.ts";

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
export const sizeMultiplier = sizeMultiplierMath;

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

/** Current subscription-bucket balance (clamped ≥ 0) — the monthly allowance left this period. */
async function fetchSubscriptionBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data } = await admin
    .from("ai_credit_buckets")
    .select("subscription_balance")
    .eq("user_id", userId)
    .maybeSingle();
  return Math.max(0, Number((data as { subscription_balance: number } | null)?.subscription_balance ?? 0));
}

/**
 * Deduct `cost` credits, subscription-bucket first then purchased — the single
 * source of truth for spending. Writes one ledger row, or two when the spend
 * straddles the bucket boundary. The cost-bearing analytics fields (model,
 * tokens, image_count) are attached to exactly ONE row so the
 * ai_generation_costs view never double-counts a single generation.
 *
 * Callers must do their own pre-flight balance check (fetchUserBalance) — this
 * helper assumes the spend is already authorized.
 */
export async function recordSpend(
  admin: SupabaseClient,
  userId: string,
  reason: string,
  cost: number,
  logFields: CreditLogFields = {},
): Promise<void> {
  if (cost <= 0) return;
  const subBalance = await fetchSubscriptionBalance(admin, userId);
  const { subSpend, purSpend } = splitSpend(cost, subBalance);

  const rows: Record<string, unknown>[] = [];
  if (subSpend > 0) {
    rows.push({ user_id: userId, delta: -subSpend, reason, is_byok: false, bucket: "subscription", ...logFields });
  }
  if (purSpend > 0) {
    // logFields only on the purchased row if the subscription row didn't already carry them.
    rows.push({ user_id: userId, delta: -purSpend, reason, is_byok: false, bucket: "purchased", ...(subSpend > 0 ? {} : logFields) });
  }
  const { error } = await admin.from("ai_credit_ledger").insert(rows);
  if (error) console.error(`Failed to record spend (${reason}):`, error);
}

/**
 * Records a generation in the ledger.
 * - isByok=true  → delta=0  (analytics only, user pays their own API bill)
 * - isByok=false → subscription-first deduction via recordSpend()
 */
export async function recordGeneration(
  admin: SupabaseClient,
  userId: string,
  generationType: string,
  isByok: boolean,
  cost: number,
  logFields: CreditLogFields = {},
): Promise<void> {
  if (isByok) {
    const { error } = await admin.from("ai_credit_ledger").insert({
      user_id: userId,
      delta: 0,
      reason: generationType,
      is_byok: true,
      ...logFields,
    });
    if (error) console.error(`Failed to record generation (${generationType}):`, error);
    return;
  }
  await recordSpend(admin, userId, generationType, cost, logFields);
}
