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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let packId: string;
  try {
    const body = await req.json();
    packId = body.packId;
    if (!packId) throw new Error("missing packId");
  } catch {
    return new Response("Invalid JSON body — need { packId }", { status: 400 });
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

  const origin = req.headers.get("origin") ?? Deno.env.get("SITE_URL") ?? "https://dungeongrimoire.com";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      allow_promotion_codes: true,
      line_items: [{ price: pack.stripe_price_id, quantity: 1 }],
      metadata: {
        user_id: user.id,
        credits: String(pack.credits),
        pack_id: packId,
      },
      success_url: `${origin}/billing?credit_purchase=success`,
      cancel_url: `${origin}/billing`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Stripe checkout creation failed:", err);
    return new Response("Failed to create checkout session", { status: 500 });
  }
});
