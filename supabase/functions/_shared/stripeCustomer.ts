import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

/**
 * Return the user's Stripe customer id, creating + persisting one on first use.
 * Shared by the subscription and credit-pack checkouts so every charge is tied
 * to a customer — required so refunds/disputes resolve back to the user (and for
 * recognizable receipts).
 */
export async function getOrCreateStripeCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  userId: string,
  email: string | undefined,
): Promise<string> {
  const { data } = await admin
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  const existing = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
  if (existing) return existing;

  const customer = await stripe.customers.create({ email, metadata: { supabase_user_id: userId } });
  await admin
    .from("user_subscriptions")
    .update({ stripe_customer_id: customer.id })
    .eq("user_id", userId);
  return customer.id;
}
