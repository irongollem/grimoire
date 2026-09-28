import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { withCors } from "../_shared/cors.ts";
import { childAccountResponse, isChildAccount } from "../_shared/accountGate.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2026-07-29.dahlia",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(withCors(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
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

    // A child account (#919) has never been able to buy anything, so it has
    // no billing portal to open. Fails CLOSED, unlike the generation gate: a
    // request refused on a transient DB blip is just retried, but a child
    // reaching Stripe is not an acceptable failure mode.
    try {
      if (await isChildAccount(admin, user.id)) return childAccountResponse();
    } catch (e) {
      console.error("stripe-create-portal: child-account check failed:", e);
      return json({ error: "account_check_failed" }, 500);
    }

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
}));
