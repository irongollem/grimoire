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

  let planId: string;
  let monthlyPriceId: string | undefined;
  let annualPriceId: string | undefined;
  try {
    const body = await req.json();
    planId = body.planId;
    monthlyPriceId = body.monthlyPriceId || undefined;
    annualPriceId = body.annualPriceId || undefined;
    if (!planId) throw new Error("missing planId");
    if (!monthlyPriceId && !annualPriceId) throw new Error("provide at least one price ID");
  } catch {
    return new Response("Invalid body — need { planId, monthlyPriceId?, annualPriceId? }", { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (monthlyPriceId) {
    try {
      const price = await stripe.prices.retrieve(monthlyPriceId, { expand: ["currency_options"] });
      update.stripe_price_id = monthlyPriceId;
      update.stripe_monthly_unit_amount = price.unit_amount;
      update.stripe_currency = price.currency;
      update.stripe_monthly_currency_options = price.currency_options ?? null;
    } catch (err) {
      console.error("Stripe monthly price fetch failed:", err);
      return new Response("Monthly price ID not found or fetch failed", { status: 400 });
    }
  }

  if (annualPriceId) {
    try {
      const price = await stripe.prices.retrieve(annualPriceId, { expand: ["currency_options"] });
      update.stripe_annual_price_id = annualPriceId;
      update.stripe_annual_unit_amount = price.unit_amount;
      if (!update.stripe_currency) update.stripe_currency = price.currency;
      update.stripe_annual_currency_options = price.currency_options ?? null;
    } catch (err) {
      console.error("Stripe annual price fetch failed:", err);
      return new Response("Annual price ID not found or fetch failed", { status: 400 });
    }
  }

  const { error } = await admin.from("plans").update(update).eq("id", planId);
  if (error) {
    console.error("DB update failed:", error);
    return new Response("Failed to update plan", { status: 500 });
  }

  return new Response(JSON.stringify(update), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
