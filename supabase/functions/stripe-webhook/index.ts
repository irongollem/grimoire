import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { resetDelta } from "../_shared/credit-math.ts";
import { clawbackAmount } from "../_shared/creditLots.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function toDateStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().substring(0, 10);
}

async function updateByCustomer(
  customerId: string,
  fields: Record<string, unknown>,
) {
  const { error } = await admin
    .from("user_subscriptions")
    .update(fields)
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

async function getUserIdByCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (error || !data) return null;
  return data.user_id;
}

/** The monthly included-credit allowance for a user's current plan (0 if none). */
async function fetchPlanMonthlyCredits(userId: string): Promise<number> {
  const { data: subRow } = await admin
    .from("user_subscriptions")
    .select("plan_id")
    .eq("user_id", userId)
    .maybeSingle();
  const planId = (subRow as { plan_id: string } | null)?.plan_id;
  if (!planId) return 0;
  const { data: plan } = await admin
    .from("plans")
    .select("monthly_credits")
    .eq("id", planId)
    .maybeSingle();
  return (plan as { monthly_credits: number } | null)?.monthly_credits ?? 0;
}

/**
 * Reset the subscription bucket to this period's allowance — use-it-or-lose-it.
 * Idempotent per period. Rather than ADDING credits (which would let unused
 * credits accumulate), we write a single delta that sets the subscription
 * bucket's running sum to exactly `allowance`, expiring whatever was left over
 * from last period. Purchased pack credits live in a separate bucket and are
 * untouched.
 */
async function topUpSubscriptionCredits(
  userId: string,
  subscriptionId: string,
  periodStart: string,
) {
  // Idempotency: only reset once per subscription period
  const { data: existing } = await admin
    .from("ai_credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", "subscription_topup")
    .eq("subscription_period_start", periodStart)
    .maybeSingle();
  if (existing) return; // already reset this period

  const allowance = await fetchPlanMonthlyCredits(userId);

  // Current subscription-bucket sum (may include last period's unused credits,
  // or be negative from an over-draw). delta restores it to exactly `allowance`.
  const { data: bucket } = await admin
    .from("ai_credit_buckets")
    .select("subscription_balance")
    .eq("user_id", userId)
    .maybeSingle();
  const current = Number((bucket as { subscription_balance: number } | null)?.subscription_balance ?? 0);
  const delta = resetDelta(allowance, current);

  // Always write exactly one row per period — even a delta of 0 — so it serves
  // as the idempotency marker. Omitting it would let a replayed webhook re-reset
  // the allowance mid-period after the user had already spent some.
  const { error } = await admin.from("ai_credit_ledger").insert({
    user_id: userId,
    delta,
    reason: "subscription_topup",
    bucket: "subscription",
    subscription_period_start: periodStart,
  });
  // 23505 = unique violation: a concurrent delivery already reset this period. Safe to ignore.
  if (error && error.code !== "23505") throw error;
}

/**
 * Keep our cached prices in lock-step with Stripe so the UI never shows a stale
 * amount. Fired on price.created/price.updated. Re-fetches the price (to get
 * currency_options, which webhook payloads omit) and refreshes whichever
 * plan (monthly or annual) or credit pack references it. The actual CHARGE is
 * always the live Stripe price (checkout passes price IDs) — this only keeps the
 * DISPLAY cache honest.
 */
async function syncPriceCacheFromStripe(priceId: string) {
  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(priceId, { expand: ["currency_options"] });
  } catch (err) {
    console.error(`Price ${priceId} retrieve failed:`, err);
    return;
  }

  // Plan — monthly price column
  const { data: monthlyPlan } = await admin
    .from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
  if (monthlyPlan) {
    await admin.from("plans").update({
      stripe_monthly_unit_amount: price.unit_amount,
      stripe_currency: price.currency,
      stripe_monthly_currency_options: price.currency_options ?? null,
    }).eq("id", (monthlyPlan as { id: string }).id);
  }

  // Plan — annual price column
  const { data: annualPlan } = await admin
    .from("plans").select("id, stripe_currency").eq("stripe_annual_price_id", priceId).maybeSingle();
  if (annualPlan) {
    const row = annualPlan as { id: string; stripe_currency: string | null };
    const upd: Record<string, unknown> = {
      stripe_annual_unit_amount: price.unit_amount,
      stripe_annual_currency_options: price.currency_options ?? null,
    };
    if (!row.stripe_currency) upd.stripe_currency = price.currency;
    await admin.from("plans").update(upd).eq("id", row.id);
  }

  // Credit pack
  const { data: pack } = await admin
    .from("credit_pack_config").select("pack_id").eq("stripe_price_id", priceId).maybeSingle();
  if (pack) {
    await admin.from("credit_pack_config").update({
      stripe_unit_amount: price.unit_amount,
      stripe_currency: price.currency,
      stripe_currency_options: price.currency_options ?? null,
    }).eq("pack_id", (pack as { pack_id: string }).pack_id);
  }
}

async function creditPackPurchase(
  userId: string,
  credits: number,
  paymentIntentId: string,
) {
  // Idempotency: check payment intent uniqueness
  const { data: existing } = await admin
    .from("ai_credit_ledger")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (existing) return; // already processed

  const { error } = await admin.from("ai_credit_ledger").insert({
    user_id: userId,
    delta: credits,
    reason: "pack_purchase",
    bucket: "purchased", // permanent overage — never expires
    stripe_payment_intent_id: paymentIntentId,
  });
  // 23505 = unique violation: this payment intent was already credited. Safe to ignore.
  if (error && error.code !== "23505") throw error;
}

/** The most recent refund id for a charge (from the payload, else fetched). */
async function latestRefundId(charge: Stripe.Charge): Promise<string | null> {
  const inline = charge.refunds?.data?.[0]?.id;
  if (inline) return inline;
  const list = await stripe.refunds.list({ charge: charge.id, limit: 1 });
  return list.data[0]?.id ?? null;
}

/**
 * Reverse the credits granted by a credit-pack purchase when its payment is
 * refunded or charged back. Idempotent on `clawbackKey` (a Stripe refund or
 * dispute id) via the unique index — so the admin refund tool and this webhook
 * can't double-debit (whichever runs second hits 23505 and no-ops). Clawback is
 * clamped so the purchased balance can't go negative. A 0-delta row is still
 * written: it marks the pack refunded (so the FIFO projection won't offer it
 * again) and serves as the idempotency marker.
 */
async function clawbackPackCredits(
  paymentIntentId: string,
  clawbackKey: string,
  note: string,
) {
  const { data: purchase } = await admin
    .from("ai_credit_ledger")
    .select("user_id, delta")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("reason", "pack_purchase")
    .maybeSingle();
  // Not a credit-pack charge (e.g. a subscription invoice) — nothing to reverse.
  if (!purchase) return;

  const userId = (purchase as { user_id: string }).user_id;
  const credits = Number((purchase as { delta: number }).delta);

  const { data: bucket } = await admin
    .from("ai_credit_buckets")
    .select("purchased_balance")
    .eq("user_id", userId)
    .maybeSingle();
  const purchasedBalance = Number((bucket as { purchased_balance: number } | null)?.purchased_balance ?? 0);

  const clawback = clawbackAmount(credits, purchasedBalance);

  const { error } = await admin.from("ai_credit_ledger").insert({
    user_id: userId,
    delta: -clawback,
    reason: "pack_refund",
    bucket: "purchased",
    is_byok: false,
    refunded_payment_intent_id: paymentIntentId,
    stripe_refund_id: clawbackKey,
    note,
  });
  // 23505 = the admin tool or a retried delivery already recorded this clawback.
  if (error && error.code !== "23505") throw error;
}

/**
 * Soft-freeze a user's account (blocks paid actions; login stays). Used on
 * chargeback / fraud-warning. Resolves the user from the Stripe customer; an
 * admin can lift it from the admin panel.
 */
async function suspendUserByCustomer(customerId: string | null, reason: string) {
  if (!customerId) return;
  const userId = await getUserIdByCustomer(customerId);
  if (!userId) return;
  const { error } = await admin
    .from("user_subscriptions")
    .update({ suspended_at: toIso(Math.floor(Date.now() / 1000)), suspension_reason: reason })
    .eq("user_id", userId)
    .is("suspended_at", null); // don't overwrite an earlier freeze timestamp
  if (error) console.error("suspendUserByCustomer:", error);
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const sig = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!sig || !webhookSecret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          await updateByCustomer(session.customer as string, {
            plan_id: "pro",
            status: "active",
            stripe_subscription_id: sub.id,
            current_period_end: toIso(sub.current_period_end),
            cancel_at_period_end: false,
            cancel_at: null,
          });
        } else if (session.mode === "payment") {
          // Credit pack purchase — metadata set by stripe-create-credit-checkout
          const userId = session.metadata?.user_id;
          const credits = parseInt(session.metadata?.credits ?? "0", 10);
          const paymentIntentId = session.payment_intent as string | null;

          if (userId && credits > 0 && paymentIntentId) {
            await creditPackPurchase(userId, credits, paymentIntentId);
          } else {
            console.warn("checkout.session.completed payment: missing metadata", session.id);
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const sub = await stripe.subscriptions.retrieve(
          invoice.subscription as string,
        );
        await updateByCustomer(invoice.customer as string, {
          status: "active",
          current_period_end: toIso(sub.current_period_end),
        });

        // Reset the subscription credit bucket to the plan's monthly allowance (idempotent per period)
        const userId = await getUserIdByCustomer(invoice.customer as string);
        if (userId && invoice.period_start) {
          const periodStart = toDateStr(invoice.period_start);
          await topUpSubscriptionCredits(userId, sub.id, periodStart);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await updateByCustomer(invoice.customer as string, {
          status: "past_due",
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await updateByCustomer(sub.customer as string, {
          status: sub.status,
          current_period_end: toIso(sub.current_period_end),
          cancel_at_period_end: sub.cancel_at_period_end,
          cancel_at: sub.cancel_at ? toIso(sub.cancel_at) : null,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await updateByCustomer(sub.customer as string, {
          plan_id: "free",
          status: "canceled",
          stripe_subscription_id: null,
          current_period_end: null,
        });
        break;
      }

      case "charge.refunded": {
        // A credit-pack charge was refunded (Stripe Dashboard, API, or our admin
        // tool). Reverse the granted credits — idempotent, so an admin-initiated
        // refund that already clawed back is a no-op here.
        const charge = event.data.object as Stripe.Charge;
        const pi = charge.payment_intent as string | null;
        if (!pi) break;
        const refundId = await latestRefundId(charge);
        if (!refundId) {
          console.warn("charge.refunded with no resolvable refund id", charge.id);
          break;
        }
        await clawbackPackCredits(pi, refundId, "stripe refund");
        break;
      }

      case "charge.dispute.created": {
        // Chargeback opened — reverse any credit-pack credits AND soft-freeze the
        // account so the disputing user can't keep generating while it's resolved.
        const dispute = event.data.object as Stripe.Dispute;
        const reason = `chargeback: ${dispute.reason ?? "unknown"}`;
        const pi = dispute.payment_intent as string | null;
        if (pi) await clawbackPackCredits(pi, dispute.id, reason);
        const dCharge = dispute.charge ? await stripe.charges.retrieve(dispute.charge as string) : null;
        await suspendUserByCustomer((dCharge?.customer as string | null) ?? null, reason);
        break;
      }

      case "radar.early_fraud_warning.created": {
        // Fraud warning often precedes a chargeback — freeze proactively + flag.
        const efw = event.data.object as Stripe.Radar.EarlyFraudWarning;
        const fCharge = efw.charge ? await stripe.charges.retrieve(efw.charge as string) : null;
        await suspendUserByCustomer(
          (fCharge?.customer as string | null) ?? null,
          `early fraud warning: ${efw.fraud_type ?? "unknown"}`,
        );
        break;
      }

      case "price.created":
      case "price.updated": {
        const price = event.data.object as Stripe.Price;
        await syncPriceCacheFromStripe(price.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`Error processing ${event.type}:`, err);
    return new Response("Internal server error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
