/**
 * Credit deduction helpers for server-side generation edge functions.
 * BYOK calls log delta=0 (user pays their own API bill).
 * Platform-key calls deduct from the user's credit balance.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sizeMultiplier as sizeMultiplierMath } from "./credit-math.ts";

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

export interface SpendResult {
  ok: boolean;
  balance: number;
  insufficient?: boolean;
  /** Account frozen — spend refused (distinct from insufficient). */
  suspended?: boolean;
  /** New-account velocity cap hit — spend refused. */
  velocity?: boolean;
}

/**
 * Build the HTTP error response for a refused paid spend, mapping the distinct
 * reasons (frozen / rate-limited / insufficient) to the right status + message.
 * Shared by every generator + deduct-ai-credit so the surfaced reason is honest.
 */
export function reservationFailureResponse(
  r: { suspended?: boolean; velocity?: boolean; balance?: number },
  cors: Record<string, string>,
): Response {
  const headers = { ...cors, "Content-Type": "application/json" };
  if (r.suspended) {
    return new Response(JSON.stringify({ error: "account_suspended" }), { status: 403, headers });
  }
  if (r.velocity) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        message: "New accounts have a temporary limit on how fast credits can be spent. Please try again shortly.",
      }),
      { status: 429, headers },
    );
  }
  return new Response(
    JSON.stringify({ error: "insufficient_credits", balance: r.balance ?? 0 }),
    { status: 402, headers },
  );
}

export interface Reservation {
  ok: boolean;
  /** Pending ledger row ids to release once the generation settles. */
  ids: string[];
  insufficient?: boolean;
  /** Account is frozen — paid generation refused (distinct from insufficient). */
  suspended?: boolean;
  /** New-account velocity cap hit — paid generation refused. */
  velocity?: boolean;
  balance?: number;
}

/**
 * Atomic affordability GATE that holds the balance for the duration of a paid
 * provider call. Inserts PENDING negative ledger rows (counted in the balance so
 * concurrent reservations cannot all pass, but excluded from the analytics view).
 * MUST be called BEFORE the paid call. cost <= 0 (BYOK / free) reserves nothing.
 * Always pair a successful reservation with releaseCredits() — on success release
 * the hold then record the real spend via recordGeneration(); on failure release.
 */
export async function reserveCredits(
  admin: SupabaseClient,
  userId: string,
  cost: number,
  reason = "reserve",
): Promise<Reservation> {
  if (cost <= 0) return { ok: true, ids: [] };
  const { data, error } = await admin.rpc("reserve_credits", {
    p_user_id: userId,
    p_reason: reason,
    p_cost: cost,
  });
  if (error) {
    console.error(`Failed to reserve credits (${reason}):`, error);
    return { ok: false, ids: [] };
  }
  const res = data as { ok: boolean; ids?: string[]; insufficient?: boolean; suspended?: boolean; velocity?: boolean; balance?: number };
  return { ok: res.ok, ids: res.ids ?? [], insufficient: res.insufficient, suspended: res.suspended, velocity: res.velocity, balance: res.balance };
}

/** Drop a pending reservation hold (call on both the success and failure paths). */
export async function releaseCredits(admin: SupabaseClient, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await admin.rpc("release_credits", { p_ids: ids });
  if (error) console.error("Failed to release credit reservation:", error);
}

/**
 * Atomic, race-free credit spend via the spend_credits() RPC (advisory-locked
 * per user, subscription-bucket first). The cost-bearing analytics fields
 * (model, tokens, image_count) are attached to exactly ONE ledger row so the
 * ai_generation_costs view never double-counts a single generation.
 *
 * @param allowNegative when true, records a spend for work already performed
 *   (the generator already called the paid AI API) — never refused. When false,
 *   it is an atomic affordability GATE: nothing is written if the user can't pay.
 */
export async function spendCredits(
  admin: SupabaseClient,
  userId: string,
  reason: string,
  cost: number,
  logFields: CreditLogFields = {},
  allowNegative = true,
): Promise<SpendResult> {
  if (cost <= 0) return { ok: true, balance: await fetchUserBalance(admin, userId) };
  const { data, error } = await admin.rpc("spend_credits", {
    p_user_id: userId,
    p_reason: reason,
    p_cost: cost,
    p_log: logFields,
    p_allow_negative: allowNegative,
  });
  if (error) {
    console.error(`Failed to record spend (${reason}):`, error);
    return { ok: false, balance: 0 };
  }
  return data as SpendResult;
}

/**
 * Record a spend for work already performed (generation already happened).
 * Thin wrapper kept for the generator call sites that pre-checked the balance.
 */
export async function recordSpend(
  admin: SupabaseClient,
  userId: string,
  reason: string,
  cost: number,
  logFields: CreditLogFields = {},
): Promise<void> {
  await spendCredits(admin, userId, reason, cost, logFields, true);
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
