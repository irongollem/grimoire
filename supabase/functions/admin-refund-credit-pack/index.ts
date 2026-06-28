import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsHeaders } from "../_shared/cors.ts";
import { computePackLots, clawbackAmount, type LedgerRowLite } from "../_shared/creditLots.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** All ledger columns the FIFO lot projection needs, for one user. */
async function loadLedger(userId: string): Promise<LedgerRowLite[]> {
  const { data, error } = await admin
    .from("ai_credit_ledger")
    .select("id, delta, reason, bucket, pending, created_at, stripe_payment_intent_id, refunded_payment_intent_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as LedgerRowLite[];
}

async function purchasedBalance(userId: string): Promise<number> {
  const { data } = await admin
    .from("ai_credit_buckets")
    .select("purchased_balance")
    .eq("user_id", userId)
    .maybeSingle();
  return Number((data as { purchased_balance: number } | null)?.purchased_balance ?? 0);
}

serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Verify caller is an admin from their signed JWT (mirrors is_app_admin()).
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);
  if (user.app_metadata?.role !== "admin") return json({ error: "Forbidden" }, 403);

  let body: { action?: string; userId?: string; paymentIntentId?: string; override?: boolean; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { action, userId } = body;
  if (!userId) return json({ error: "Missing userId" }, 400);

  try {
    const lots = computePackLots(await loadLedger(userId), Date.now());

    // ── list: refund eligibility for every pack this user bought ──────────────
    if (action === "list") {
      return json({ lots });
    }

    // ── refund: issue the Stripe refund + claw back credits ───────────────────
    if (action === "refund") {
      const { paymentIntentId, override, reason } = body;
      if (!paymentIntentId) return json({ error: "Missing paymentIntentId" }, 400);

      const lot = lots.find((l) => l.paymentIntentId === paymentIntentId);
      if (!lot) return json({ error: "Pack not found for this user" }, 404);
      if (lot.alreadyRefunded) return json({ error: "already_refunded" }, 409);

      // Policy gate — ineligible packs need an explicit override + reason.
      if (!lot.eligible) {
        if (!override) {
          return json({
            error: "not_eligible",
            detail: lot.withinWindow
              ? `Pack is partly spent (${lot.consumed}/${lot.credits} used). Override to refund anyway.`
              : "Pack is past the 14-day window. Override to refund anyway.",
            lot,
          }, 409);
        }
        if (!reason || !reason.trim()) {
          return json({ error: "override_reason_required" }, 400);
        }
      }

      const clawback = clawbackAmount(lot.credits, await purchasedBalance(userId));

      // Money first: issue the full refund on the original payment intent.
      let refund: Stripe.Refund;
      try {
        refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
      } catch (err) {
        console.error("Stripe refund failed:", err);
        return json({ error: "stripe_refund_failed" }, 502);
      }

      // Then claw back credits. Idempotent on stripe_refund_id — if the
      // charge.refunded webhook (or a retried call) already wrote it, that's fine.
      const note = !lot.eligible && override ? `OVERRIDE: ${reason!.trim()}` : (reason?.trim() || "admin refund");
      const { error: insErr } = await admin.from("ai_credit_ledger").insert({
        user_id: userId,
        delta: -clawback,
        reason: "pack_refund",
        bucket: "purchased",
        is_byok: false,
        refunded_payment_intent_id: paymentIntentId,
        stripe_refund_id: refund.id,
        note,
      });
      if (insErr && insErr.code !== "23505") {
        // Refund went through but the clawback row failed — surface loudly so it
        // can be reconciled (the charge.refunded webhook is the safety net).
        console.error("Clawback insert failed after refund:", insErr);
        return json({ error: "clawback_failed", refundId: refund.id, clawback }, 500);
      }

      return json({ ok: true, refundId: refund.id, clawedBack: clawback });
    }

    return json({ error: "Unknown action — use 'list' or 'refund'" }, 400);
  } catch (err) {
    console.error("admin-refund-credit-pack:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
