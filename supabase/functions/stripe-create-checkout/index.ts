import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Service-role client for writes (user_subscriptions has no update RLS policy)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get or create Stripe Customer
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    let customerId = sub?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from("user_subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);
    }

    // Resolve price ID: plans table first, env fallback
    const { data: plan } = await admin
      .from("plans")
      .select("stripe_price_id")
      .eq("id", "pro")
      .single();

    const body = await req.json().catch(() => ({}));
    const interval: "month" | "year" = body.interval === "year" ? "year" : "month";

    // Annual price ID lives in a separate env var until we add stripe_annual_price_id column
    const priceId =
      interval === "year"
        ? (Deno.env.get("STRIPE_PRO_ANNUAL_PRICE_ID") ?? plan?.stripe_price_id)
        : plan?.stripe_price_id ?? Deno.env.get("STRIPE_PRO_MONTHLY_PRICE_ID");

    if (!priceId) {
      return json({ error: "Pro plan price not configured — set stripe_price_id on the pro plan row or STRIPE_PRO_MONTHLY_PRICE_ID env var" }, 500);
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://dungeongrimoire.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/pricing`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("stripe-create-checkout:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
