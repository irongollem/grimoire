import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { withCors } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2026-07-29.dahlia",
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

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
    headers: { "Content-Type": "application/json" },
  });
}));
