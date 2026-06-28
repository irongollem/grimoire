import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type Stripe from "https://esm.sh/stripe@14?target=deno";
import { WITHDRAWAL_CONSENT_FOOTER } from "./consent.ts";

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

  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
    // Consent waiver rides on every invoice for this customer (subscription
    // invoices have no per-session footer hook) so the confirmation carries it.
    invoice_settings: { footer: WITHDRAWAL_CONSENT_FOOTER },
  });
  await admin
    .from("user_subscriptions")
    .update({ stripe_customer_id: customer.id })
    .eq("user_id", userId);
  return customer.id;
}
