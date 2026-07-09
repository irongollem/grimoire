import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { corsHeaders } from "../_shared/cors.ts";

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify caller is an admin from their verified JWT (app_metadata.role is
  // server-controlled and signed), mirroring is_app_admin() in the DB.
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (user.app_metadata?.role !== "admin") {
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
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
