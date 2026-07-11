import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
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
  // Origin-allowlisted CORS (shared helper).
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Frozen accounts can't buy credits.
  const { data: subRow } = await admin
    .from("user_subscriptions")
    .select("suspended_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subRow?.suspended_at) {
    return new Response("account_suspended", { status: 403 });
  }

  // Attach a Stripe customer so refunds/disputes on this charge resolve back to
  // the user (enables auto-clawback + auto-freeze on chargeback).
  const customerId = await getOrCreateStripeCustomer(admin, stripe, user.id, user.email ?? undefined);

  let packId: string;
  let withdrawalConsent = false;
  try {
    const body = await req.json();
    packId = body.packId;
    withdrawalConsent = body.withdrawalConsent === true;
    if (!packId) throw new Error("missing packId");
  } catch {
    return new Response("Invalid JSON body — need { packId }", { status: 400 });
  }

  // R3: the buyer must have ticked the separate withdrawal-consent checkbox.
  if (!withdrawalConsent) {
    return new Response("withdrawal_consent_required", { status: 400 });
  }

  // Look up pack from DB (price ID + credit amount stored in credit_pack_config)
  const { data: pack, error: packError } = await admin
    .from("credit_pack_config")
    .select("pack_id, credits, stripe_price_id")
    .eq("pack_id", packId)
    .maybeSingle();

  if (packError || !pack) {
    return new Response(`Unknown pack: ${packId}`, { status: 400 });
  }

  if (!pack.stripe_price_id) {
    console.error(`No stripe_price_id configured for pack: ${packId}`);
    return new Response("Stripe price not configured for this pack — contact support", { status: 500 });
  }

  const { promo_codes_enabled: promoCodesEnabled } = await getCheckoutConfig();

  const origin = req.headers.get("origin") ?? Deno.env.get("SITE_URL") ?? "https://app.dungeongrimoire.com";

  // Collapse accidental double-submits (double-click, impatient re-click, client
  // retry) onto one Checkout Session: same key within a 30s bucket returns the
  // same session instead of minting a second one Stripe would charge separately.
  // Scoped per user+pack so distinct purchases never collide; a deliberate repeat
  // buy lands in a later bucket. (A double-click straddling a bucket boundary
  // falls back to today's behaviour — an extra abandoned session, still no double
  // charge.) Stripe caches idempotent results for 24h.
  const idempotencyKey = `credit:${user.id}:${packId}:${Math.floor(Date.now() / 30000)}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      submit_type: "pay", // EU: button reads "Pay" — clear payment obligation
      allow_promotion_codes: promoCodesEnabled,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      // Emit an invoice so the confirmation email carries the Dashboard "Default
      // footer" (the receipt can't carry custom text); footer text is managed there.
      invoice_creation: { enabled: true },
      // Stripe-recorded ToS acceptance. The separate withdrawal waiver is its own
      // app checkbox (recorded in purchase_consents) + the invoice footer above.
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: {
          message: `I agree to the [Terms of Service](${origin}/terms) and [Refund Policy](${origin}/refunds).`,
        },
      },
      line_items: [{ price: pack.stripe_price_id, quantity: 1 }],
      metadata: {
        user_id: user.id,
        credits: String(pack.credits),
        pack_id: packId,
      },
      success_url: `${origin}/billing?credit_purchase=success`,
      cancel_url: `${origin}/billing`,
    }, { idempotencyKey });

    // R3: record the withdrawal consent (server timestamp = authoritative).
    await admin.from("purchase_consents").insert({
      user_id: user.id,
      purpose: "credit_pack",
      consent_version: WITHDRAWAL_CONSENT_VERSION,
      stripe_session_id: session.id,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Stripe checkout creation failed:", err);
    return new Response("Failed to create checkout session", { status: 500 });
  }
});
