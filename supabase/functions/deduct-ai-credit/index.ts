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

  // Verify user via JWT
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
  try {
    const body = await req.json();
    reason = body.reason;
    amount = Number(body.amount ?? 1);
    if (!reason || amount < 1) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { reason, amount }", { status: 400 });
  }

  // Check balance atomically — read and write using service role to bypass RLS
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
