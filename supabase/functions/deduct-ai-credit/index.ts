import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { spendCredits, reservationFailureResponse } from "../_shared/credits.ts";
import { withCors } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(withCors(async (req: Request) => {
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
    // #609: the client (useAiCredits.ts logUsage()) now calls this for EVERY
    // BYOK/local-key generation, including ones where the provider reported no
    // token counts (fal.ai, some responses) — input_tokens/input_image_tokens/
    // output_tokens land undefined in that case and insert as NULL (all three
    // columns are nullable). That's correct and expected: a token-less row still
    // proves the generation happened, which is the point of closing the gap.
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
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // Platform-key path: atomic affordability gate + subscription-first deduction.
  // spend_credits() recomputes the balance under a per-user advisory lock and
  // refuses (writes nothing) when the user can't afford it — so N concurrent
  // requests can't all pass a stale balance check and over-draw.
  const result = await spendCredits(
    admin,
    user.id,
    reason,
    amount,
    { model, provider, input_tokens, input_image_tokens, output_tokens, image_count },
    false, // gate: do not allow the balance to go negative
  );

  if (!result.ok) {
    return reservationFailureResponse(result);
  }

  return new Response(
    JSON.stringify({ ok: true, balance: result.balance }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
