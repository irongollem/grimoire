import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

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

async function topUpSubscriptionCredits(
  userId: string,
  subscriptionId: string,
  periodStart: string,
) {
  // Idempotency: only credit once per subscription period
  const { data: existing } = await admin
    .from("ai_credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", "subscription_topup")
    .eq("subscription_period_start", periodStart)
    .maybeSingle();

  if (existing) return; // already credited this period

  const { error } = await admin.from("ai_credit_ledger").insert({
    user_id: userId,
    delta: 5,
    reason: "subscription_topup",
    subscription_period_start: periodStart,
  });
  if (error) throw error;
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
    stripe_payment_intent_id: paymentIntentId,
  });
  if (error) throw error;
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

        // Top up 5 AI credits per billing period (idempotent)
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
