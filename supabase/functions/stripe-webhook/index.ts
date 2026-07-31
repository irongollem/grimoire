import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { withCors } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2026-07-29.dahlia",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Basil (2025-03-31) moved `current_period_end` off Subscription and onto each
 * SubscriptionItem, because one subscription can bill its items on different
 * cadences. We sell a single-item "pro" plan, so there is one period in
 * practice — taking the latest across items keeps this correct if a plan ever
 * gains a second item, rather than silently reporting the first item's date.
 */
function subscriptionPeriodEnd(sub: Stripe.Subscription): string | null {
  const ends = (sub.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((end): end is number => typeof end === "number");
  if (ends.length > 0) return toIso(Math.max(...ends));

  // Pre-Basil fallback. A webhook payload's shape follows the ENDPOINT's API
  // version configured in the Stripe Dashboard, not this SDK's — so events can
  // still arrive in the old shape until that endpoint is moved to
  // 2026-07-29.dahlia. Without this, customer.subscription.* would null out
  // current_period_end on every delivery. Reading both shapes makes the code
  // and the Dashboard safe to update in either order.
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof legacy === "number" ? toIso(legacy) : null;
}

/**
 * Basil also moved the invoice's subscription pointer under `parent`, next to
 * the other things an invoice can be raised for. It is only populated on
 * subscription invoices, and may arrive expanded or as a bare id.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (sub) return typeof sub === "string" ? sub : sub.id;

  // Pre-Basil fallback, for the same reason as subscriptionPeriodEnd: if the
  // Dashboard endpoint is still on an older version this arrives at the old
  // top-level path, and returning null here would silently skip every
  // invoice.payment_succeeded — a paying customer never marked active.
  const legacy = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (!legacy) return null;
  return typeof legacy === "string" ? legacy : legacy.id;
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

/**
 * Reset the subscription bucket to this period's allowance — use-it-or-lose-it.
 * Idempotent per period. Delegates to the locked reset_subscription_credits()
 * RPC, which takes the per-user advisory lock (serializing against
 * reserve/release_credits) and computes the current balance EXCLUDING pending
 * reservation holds. Doing this inline previously raced credit reservations and
 * could leave `allowance + h` free credits when a held generation later failed
 * (issue #493). The RPC writes exactly one row per period as the idempotency
 * marker, backstopped by the unique index (23505).
 */
async function topUpSubscriptionCredits(
  userId: string,
  subscriptionId: string,
  periodStart: string,
) {
  const { error } = await admin.rpc("reset_subscription_credits", {
    p_user_id: userId,
    p_subscription_id: subscriptionId,
    p_period_start: periodStart,
  });
  if (error) {
    console.error("reset_subscription_credits:", error);
    throw error;
  }
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

/**
 * Grant a credit-pack purchase from its Checkout Session. Shared by the
 * synchronous (card) completion and the delayed-payment settlement path so both
 * flow through the same idempotent grant (unique stripe_payment_intent_id).
 */
async function grantCreditPackFromSession(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const credits = parseInt(session.metadata?.credits ?? "0", 10);
  const paymentIntentId = session.payment_intent as string | null;
  if (userId && credits > 0 && paymentIntentId) {
    await creditPackPurchase(userId, credits, paymentIntentId);
  } else {
    console.warn("credit pack grant: missing metadata", session.id);
  }
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
 * refunded or charged back. Delegates to the locked, idempotent
 * clawback_pack_credits() RPC — one reversal per pack (refund OR dispute),
 * clamped so the purchased balance can't go negative, race-safe vs the admin
 * refund tool (advisory lock + unique stripe_refund_id).
 *
 * amountRefunded / amount thread the refunded fraction of the charge so the RPC
 * can reverse PROPORTIONALLY (a €2 goodwill refund on a €13 pack no longer wipes
 * the whole pack — see #493). Pass amountRefunded === amount for a full reversal
 * (disputes).
 */
async function clawbackPackCredits(
  paymentIntentId: string,
  clawbackKey: string,
  note: string,
  amountRefunded: number,
  amount: number,
) {
  const { error } = await admin.rpc("clawback_pack_credits", {
    p_payment_intent: paymentIntentId,
    p_key: clawbackKey,
    p_note: note,
    p_amount_refunded: amountRefunded,
    p_amount: amount,
  });
  if (error) {
    // Surface the failure so the outer handler returns 500 and Stripe RETRIES
    // this delivery. Swallowing it would 200 the webhook (Stripe never retries)
    // and permanently strand the un-clawed credits after a transient DB error.
    // Safe to retry: clawback_pack_credits is idempotent (unique stripe_refund_id
    // + existing-pack_refund guard), so a replay can't double-reverse.
    console.error("clawback_pack_credits:", error);
    throw error;
  }
}

/** Resolve our user id from a charge — by Stripe customer, else by the
 * pack-purchase ledger row (credit-pack charges have no customer attached for
 * older sessions). */
async function getUserIdByPaymentIntent(paymentIntentId: string): Promise<string | null> {
  const { data } = await admin
    .from("ai_credit_ledger")
    .select("user_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("reason", "pack_purchase")
    .maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

/**
 * Soft-freeze the account behind a charge (blocks paid actions; login stays).
 * Used on chargeback / fraud-warning. Resolves the user via the Stripe customer,
 * falling back to the pack-purchase ledger by payment intent so pack-only buyers
 * (no customer on the charge) are still frozen. An admin can lift it later.
 */
async function suspendUserForCharge(charge: Stripe.Charge | null, reason: string) {
  if (!charge) return;
  let userId = charge.customer ? await getUserIdByCustomer(charge.customer as string) : null;
  if (!userId && charge.payment_intent) {
    userId = await getUserIdByPaymentIntent(charge.payment_intent as string);
  }
  if (!userId) return;
  const { error } = await admin
    .from("user_subscriptions")
    .update({ suspended_at: toIso(Math.floor(Date.now() / 1000)), suspension_reason: reason })
    .eq("user_id", userId)
    .is("suspended_at", null); // don't overwrite an earlier freeze timestamp
  if (error) console.error("suspendUserForCharge:", error);
}

serve(withCors(async (req: Request) => {
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
            current_period_end: subscriptionPeriodEnd(sub),
            cancel_at_period_end: false,
            cancel_at: null,
          });
        } else if (session.mode === "payment") {
          // Credit pack purchase — metadata set by stripe-create-credit-checkout.
          // Only grant once the money is actually captured. Card payments are
          // "paid" here; delayed-notification methods (SEPA, Bancontact, …) fire
          // this event as "unpaid"/"processing" and settle later on
          // async_payment_succeeded. Granting on an unsettled session would hand
          // out free credits if that delayed payment ultimately fails.
          if (session.payment_status === "paid") {
            await grantCreditPackFromSession(session);
          } else {
            console.warn("credit pack awaiting async settlement", session.id, session.payment_status);
          }
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        // A delayed-notification payment (SEPA, Bancontact, …) finally settled —
        // grant now. Idempotent via the unique payment-intent index if this ever
        // races the completed handler.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") await grantCreditPackFromSession(session);
        break;
      }

      case "checkout.session.async_payment_failed": {
        // Delayed payment bounced. No credits were granted (completed only grants
        // on payment_status "paid"), so there's nothing to reverse — log only.
        const session = event.data.object as Stripe.Checkout.Session;
        console.warn("credit pack async payment failed", session.id);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSubId = invoiceSubscriptionId(invoice);
        if (!invoiceSubId) break;

        const sub = await stripe.subscriptions.retrieve(invoiceSubId);
        await updateByCustomer(invoice.customer as string, {
          status: "active",
          current_period_end: subscriptionPeriodEnd(sub),
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

      // Basil (2025-03-31) postponed subscription creation until after the
      // customer pays, so checkout.session.completed can now fire with
      // session.subscription still null. That branch has no else, so the row
      // would silently never receive plan_id or stripe_subscription_id and the
      // customer would pay without getting PRO. This performs the same
      // activation from the subscription's own event, and is idempotent with
      // the checkout path for the cases where the subscription does exist there.
      //
      // Writing sub.status verbatim is safe: isPro() requires plan_id "pro" AND
      // a status of active/trialing, so an "incomplete" subscription records its
      // identity here without granting anything.
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await updateByCustomer(sub.customer as string, {
          plan_id: "pro",
          status: sub.status,
          stripe_subscription_id: sub.id,
          current_period_end: subscriptionPeriodEnd(sub),
          cancel_at_period_end: sub.cancel_at_period_end,
          cancel_at: sub.cancel_at ? toIso(sub.cancel_at) : null,
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await updateByCustomer(sub.customer as string, {
          status: sub.status,
          current_period_end: subscriptionPeriodEnd(sub),
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
        // Proportional clawback: thread the refunded fraction of the charge.
        // charge.refunded fires on partial refunds too — amount_refunded is the
        // cumulative refunded amount, amount the original charge total.
        await clawbackPackCredits(pi, refundId, "stripe refund", charge.amount_refunded, charge.amount);
        break;
      }

      case "charge.dispute.created": {
        // Chargeback opened — reverse any credit-pack credits AND soft-freeze the
        // account so the disputing user can't keep generating while it's resolved.
        const dispute = event.data.object as Stripe.Dispute;
        const reason = `chargeback: ${dispute.reason ?? "unknown"}`;
        const pi = dispute.payment_intent as string | null;
        // A dispute is a full reversal — pass equal amounts (fraction 1.0).
        if (pi) await clawbackPackCredits(pi, dispute.id, reason, dispute.amount, dispute.amount);
        const dCharge = dispute.charge ? await stripe.charges.retrieve(dispute.charge as string) : null;
        await suspendUserForCharge(dCharge, reason);
        break;
      }

      case "radar.early_fraud_warning.created": {
        // Fraud warning often precedes a chargeback — freeze proactively + flag.
        const efw = event.data.object as Stripe.Radar.EarlyFraudWarning;
        const fCharge = efw.charge ? await stripe.charges.retrieve(efw.charge as string) : null;
        await suspendUserForCharge(fCharge, `early fraud warning: ${efw.fraud_type ?? "unknown"}`);
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
}));
