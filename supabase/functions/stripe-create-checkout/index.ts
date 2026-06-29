import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsHeaders } from "../_shared/cors.ts";
import { getOrCreateStripeCustomer } from "../_shared/stripeCustomer.ts";
import { WITHDRAWAL_CONSENT_VERSION } from "../_shared/consent.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

let checkoutConfigCache: { promo_codes_enabled: boolean } | null = null;
let checkoutConfigExpiry = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000;

async function getCheckoutConfig(): Promise<{ promo_codes_enabled: boolean }> {
  if (checkoutConfigCache && Date.now() < checkoutConfigExpiry) return checkoutConfigCache;
  const { data } = await admin.from("checkout_config").select("promo_codes_enabled").single();
  checkoutConfigCache = { promo_codes_enabled: data?.promo_codes_enabled ?? false };
  checkoutConfigExpiry = Date.now() + CONFIG_TTL_MS;
  return checkoutConfigCache;
}

serve(async (req: Request) => {
  // Origin-allowlisted CORS (shared helper) + this endpoint's method set.
  const cors = { ...corsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Get or create Stripe Customer
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("status, suspended_at")
      .eq("user_id", user.id)
      .single();

    // Frozen accounts can't start new purchases.
    if (sub?.suspended_at) return json({ error: "account_suspended" }, 403);

    // Don't let an already-subscribed user open a second subscription checkout —
    // the webhook would overwrite stripe_subscription_id and orphan the first
    // (still-billing) subscription. Send them to the billing portal instead.
    if (sub?.status === "active" || sub?.status === "trialing") {
      return json({ error: "already_subscribed" }, 409);
    }

    const customerId = await getOrCreateStripeCustomer(admin, stripe, user.id, user.email ?? undefined);

    // Resolve price ID from plans table
    const { data: plan } = await admin
      .from("plans")
      .select("stripe_price_id, stripe_annual_price_id")
      .eq("id", "pro")
      .single();

    const body = await req.json().catch(() => ({}));
    const interval: "month" | "year" = body.interval === "year" ? "year" : "month";

    // R3: the buyer must have ticked the separate withdrawal-consent checkbox.
    if (body.withdrawalConsent !== true) {
      return json({ error: "withdrawal_consent_required" }, 400);
    }

    const priceId =
      interval === "year"
        ? plan?.stripe_annual_price_id
        : plan?.stripe_price_id;

    if (!priceId) {
      return json({ error: "Pro plan price not configured — set stripe_price_id on the pro plan row or STRIPE_PRO_MONTHLY_PRICE_ID env var" }, 500);
    }

    const { promo_codes_enabled: promoCodesEnabled } = await getCheckoutConfig();

    const appUrl = Deno.env.get("APP_URL") ?? "https://app.dungeongrimoire.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      allow_promotion_codes: promoCodesEnabled,
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      // Stripe-recorded ToS acceptance. The separate withdrawal waiver is its
      // own app checkbox (recorded in purchase_consents) + the invoice footer.
      // (Enum shape is correct for apiVersion 2024-06-20; requires a ToS URL set
      // in the Stripe Dashboard branding settings.)
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message: `I agree to the [Terms of Service](${appUrl}/terms) and [Refund Policy](${appUrl}/refunds).`,
        },
      },
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/pricing`,
    });

    // R3: record the withdrawal consent (server timestamp = authoritative).
    await admin.from("purchase_consents").insert({
      user_id: user.id,
      purpose: "subscription",
      consent_version: WITHDRAWAL_CONSENT_VERSION,
      stripe_session_id: session.id,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("stripe-create-checkout:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
