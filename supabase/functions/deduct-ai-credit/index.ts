import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  let reason: string;
  let amount: number;
  let is_byok: boolean;
  let model: string | undefined;
  let provider: string | undefined;
  let input_tokens: number | undefined;
  let input_image_tokens: number | undefined;
  let output_tokens: number | undefined;
  let image_count: number | undefined;

  try {
    const body = await req.json();
    reason = body.reason;
    amount = Number(body.amount ?? 1);
    is_byok = body.is_byok === true;
    model = body.model ?? undefined;
    provider = body.provider ?? undefined;
    input_tokens = body.input_tokens != null ? Number(body.input_tokens) : undefined;
    input_image_tokens = body.input_image_tokens != null ? Number(body.input_image_tokens) : undefined;
    output_tokens = body.output_tokens != null ? Number(body.output_tokens) : undefined;
    image_count = body.image_count != null ? Number(body.image_count) : undefined;
    if (!reason || (!is_byok && amount < 1)) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { reason, amount }", { status: 400 });
  }

  if (is_byok) {
    // BYOK: user pays their own API cost — just log the generation for analytics, no credit deduction.
    const { error } = await admin.from("ai_credit_ledger").insert({
      user_id: user.id,
      delta: 0,
      reason,
      is_byok: true,
      model,
      provider,
      input_tokens,
      input_image_tokens,
      output_tokens,
      image_count,
    });
    if (error) {
      console.error("Failed to log BYOK usage:", error);
      return new Response("Internal server error", { status: 500 });
    }
    return new Response(
      JSON.stringify({ ok: true, byok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Platform-key path: check balance and deduct.
  const { data: balanceRow } = await admin
    .from("ai_credit_balance")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  const currentBalance: number = balanceRow?.balance ?? 0;

  if (currentBalance < amount) {
    return new Response(
      JSON.stringify({ error: "insufficient_credits", balance: currentBalance }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { error } = await admin.from("ai_credit_ledger").insert({
    user_id: user.id,
    delta: -amount,
    reason,
    is_byok: false,
    model,
    provider,
    input_tokens,
    input_image_tokens,
    output_tokens,
    image_count,
  });

  if (error) {
    console.error("Failed to deduct credits:", error);
    return new Response("Internal server error", { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, balance: currentBalance - amount }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
