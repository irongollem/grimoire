import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { corsHeaders } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    const customerId = sub?.stripe_customer_id as string | null;
    if (!customerId) {
      return json({ error: "No Stripe customer found — complete a checkout first" }, 400);
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://app.dungeongrimoire.com";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/dashboard`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("stripe-create-portal:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
