import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { withCors } from "../_shared/cors.ts";
import { computePackLots, type LedgerRowLite } from "../_shared/creditLots.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

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

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

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

    // ── list: refund eligibility for every pack + current purchased balance ───
    if (action === "list") {
      return json({ lots, purchasedBalance: await purchasedBalance(userId) });
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

      // Money first: issue the full refund on the original payment intent.
      let refund: Stripe.Refund;
      try {
        refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
      } catch (err) {
        console.error("Stripe refund failed:", err);
        return json({ error: "stripe_refund_failed" }, 502);
      }

      // Then claw back via the locked, idempotent RPC (clamped; safe vs the
      // charge.refunded webhook — whichever runs second no-ops).
      const note = !lot.eligible && override ? `OVERRIDE: ${reason!.trim()}` : (reason?.trim() || "admin refund");
      const { data: clawed, error: cErr } = await admin.rpc("clawback_pack_credits", {
        p_payment_intent: paymentIntentId,
        p_key: refund.id,
        p_note: note,
      });
      if (cErr) {
        // Refund went through but the clawback failed — surface loudly so it can
        // be reconciled (the charge.refunded webhook is the safety net).
        console.error("clawback_pack_credits failed after refund:", cErr);
        return json({ error: "clawback_failed", refundId: refund.id }, 500);
      }

      return json({ ok: true, refundId: refund.id, clawedBack: clawed ?? 0 });
    }

    return json({ error: "Unknown action — use 'list' or 'refund'" }, 400);
  } catch (err) {
    console.error("admin-refund-credit-pack:", err);
    return json({ error: "Internal server error" }, 500);
  }
}));
