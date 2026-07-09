import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const gate = await requireAdmin(req, cors);
  if (gate instanceof Response) return gate;

  let packId: string;
  let stripePriceId: string;
  let credits: number | undefined;
  try {
    const body = await req.json();
    packId = body.packId;
    stripePriceId = body.stripePriceId;
    credits = body.credits;
    if (!packId || !stripePriceId) throw new Error("missing fields");
    if (!stripePriceId.startsWith("price_")) throw new Error("invalid price ID format");
  } catch {
    return new Response("Invalid body — need { packId, stripePriceId }", { status: 400 });
  }

  let stripePrice: Stripe.Price;
  try {
    stripePrice = await stripe.prices.retrieve(stripePriceId, {
      expand: ["currency_options"],
    });
  } catch (err) {
    console.error("Stripe price fetch failed:", err);
    return new Response("Stripe price not found or fetch failed", { status: 400 });
  }

  const update: Record<string, unknown> = {
    stripe_price_id: stripePriceId,
    stripe_unit_amount: stripePrice.unit_amount,
    stripe_currency: stripePrice.currency,
    stripe_currency_options: stripePrice.currency_options ?? null,
  };
  if (credits !== undefined) update.credits = credits;

  const { error } = await admin
    .from("credit_pack_config")
    .update(update)
    .eq("pack_id", packId);

  if (error) {
    console.error("DB update failed:", error);
    return new Response("Failed to update pack", { status: 500 });
  }

  // Best-effort: mirror the credit count into the Stripe price + product metadata
  // so the dashboard reads true. The DB stays the source of truth for grants
  // (the webhook reads the credits frozen onto each checkout session), so a
  // failure here is non-fatal and must not roll back the DB update above.
  if (credits !== undefined) {
    try {
      await stripe.prices.update(stripePriceId, { metadata: { credits: String(credits) } });
      const productId = typeof stripePrice.product === "string"
        ? stripePrice.product
        : stripePrice.product?.id;
      if (productId) {
        await stripe.products.update(productId, { metadata: { credits: String(credits) } });
      }
    } catch (err) {
      console.error("Stripe metadata mirror sync failed (non-fatal):", err);
    }
  }

  return new Response(
    JSON.stringify({
      stripe_price_id: stripePriceId,
      stripe_unit_amount: stripePrice.unit_amount,
      stripe_currency: stripePrice.currency,
      stripe_currency_options: stripePrice.currency_options ?? null,
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
