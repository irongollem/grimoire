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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify caller is an admin
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: isAdmin } = await admin.rpc("get_admin_users");
  const adminIds: string[] = (isAdmin ?? []).map((r: { user_id: string }) => r.user_id);
  if (!adminIds.includes(user.id)) {
    return new Response("Forbidden", { status: 403 });
  }

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

  return new Response(
    JSON.stringify({
      stripe_price_id: stripePriceId,
      stripe_unit_amount: stripePrice.unit_amount,
      stripe_currency: stripePrice.currency,
      stripe_currency_options: stripePrice.currency_options ?? null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
