import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { withCors } from "../_shared/cors.ts";
import { getOrCreateStripeCustomer } from "../_shared/stripeCustomer.ts";
import { WITHDRAWAL_CONSENT_VERSION } from "../_shared/consent.ts";
import { reportEdgeError } from "../_shared/observability/report.ts";
import { checkoutReturnUrls, termsAcceptanceMessage } from "../_shared/checkoutUrls.ts";
import { hasLiveStripeSubscription } from "../_shared/subscriptionGuard.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2026-07-29.dahlia",
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

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Allow": "POST, OPTIONS" },
    });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
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
      .select("status, suspended_at, stripe_subscription_id")
      .eq("user_id", user.id)
      .single();

    // Frozen accounts can't start new purchases.
    if (sub?.suspended_at) return json({ error: "account_suspended" }, 403);

    // Don't let an already-subscribed user open a second subscription checkout —
    // the webhook would overwrite stripe_subscription_id and orphan the first
    // (still-billing) subscription. Send them to the billing portal instead.
    // Never test `status` alone here: see hasLiveStripeSubscription (#905).
    if (hasLiveStripeSubscription(sub)) {
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
    const marketingUrl = Deno.env.get("MARKETING_URL") ?? "https://dungeongrimoire.com";

    // Collapse accidental double-submits (double-click, client retry) onto one
    // Checkout Session: same key within a 30s bucket returns the same session
    // rather than opening a second one. Scoped per user+interval; a later
    // deliberate attempt lands in a new bucket. Complements the already_subscribed
    // guard above (which only fires once the first checkout's webhook lands).
    const idempotencyKey = `sub:${user.id}:${interval}:${Math.floor(Date.now() / 30000)}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      allow_promotion_codes: promoCodesEnabled,
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      // Required by both lines above whenever `customer` is passed, which it
      // always is: Stripe rejects the session outright ("Automatic tax
      // calculation in Checkout requires a valid address on the Customer" /
      // "tax_id_collection requires updating business name on the customer")
      // unless Checkout may write the address and name it collects back to the
      // customer. getOrCreateStripeCustomer creates customers with an email
      // only, so without this every upgrade 500'd before reaching Stripe (#905).
      customer_update: { address: "auto", name: "auto" },
      // Stripe-recorded ToS acceptance. The separate withdrawal waiver is its
      // own app checkbox (recorded in purchase_consents) + the invoice footer.
      // (Enum shape is correct for apiVersion 2026-07-29.dahlia; requires a ToS URL set
      // in the Stripe Dashboard branding settings.)
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message: termsAcceptanceMessage(marketingUrl),
        },
      },
      // Without a return path this lands on Billing — `/pricing`, the old
      // cancel URL, is not a route in the app.
      ...checkoutReturnUrls(appUrl, body.returnPath, { key: "checkout", value: "success" }),
    }, { idempotencyKey });

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
    // Caught here, so withCors never sees it: report it ourselves, or a
    // checkout that fails for every buyer is invisible (#905).
    await reportEdgeError(err, req);
    return json({ error: "Internal server error" }, 500);
  }
}));
