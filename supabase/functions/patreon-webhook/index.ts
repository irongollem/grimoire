import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifySignature(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("PATREON_WEBHOOK_SECRET");
  if (!secret) return false;
  const sig = req.headers.get("x-patreon-signature");
  if (!sig) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return sig === expected;
}

// Resolve which plan a set of entitled tier IDs maps to
async function resolvePlan(tierIds: string[]): Promise<string> {
  if (tierIds.length > 0) {
    const { data: plans } = await admin
      .from("plans")
      .select("id, patreon_tier_ids")
      .neq("id", "free");
    for (const plan of plans ?? []) {
      const mapped: string[] = plan.patreon_tier_ids ?? [];
      if (tierIds.some(t => mapped.includes(t))) return plan.id;
    }
  }
  return "patron";
}

serve(async (req: Request) => {
  const body = await req.text();
  const ok = () => new Response("ok", { status: 200 });
  const fail = (msg: string, status = 400) => new Response(msg, { status });

  if (req.method !== "POST") return fail("Method not allowed", 405);

  const valid = await verifySignature(req, body);
  if (!valid) return fail("Invalid signature", 401);

  const event = req.headers.get("x-patreon-event") ?? "";
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return fail("Invalid JSON");
  }

  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return ok();

  const memberId = (data.id as string | undefined) ?? "";
  const attributes = (data.attributes as Record<string, unknown>) ?? {};
  const relationships = (data.relationships as Record<string, unknown>) ?? {};
  const patronStatus = attributes.patron_status as string | null;

  // Collect entitled tier IDs from relationships
  const tiersData = (
    (relationships.currently_entitled_tiers as Record<string, unknown>)?.data as Array<{ id: string }> | undefined
  ) ?? [];
  const tierIds = tiersData.map(t => t.id);

  // Look up which user has this Patreon member ID
  const { data: sub } = await admin
    .from("user_subscriptions")
    .select("user_id, subscription_provider")
    .eq("patreon_member_id", memberId)
    .maybeSingle();

  if (event === "members:pledge:create" || event === "members:pledge:update") {
    if (!sub) return ok(); // unknown member — they'll link via OAuth

    // Don't override an active Stripe subscription
    if (sub.subscription_provider === "stripe") return ok();

    const planId = await resolvePlan(tierIds);
    const isActive = patronStatus === "active_patron";

    await admin.from("user_subscriptions").update({
      plan_id: isActive ? planId : "free",
      status: isActive ? "active" : "cancelled",
      subscription_provider: "patreon",
      patreon_member_id: memberId,
    }).eq("user_id", sub.user_id);
  } else if (event === "members:pledge:delete") {
    if (!sub || sub.subscription_provider === "stripe") return ok();

    await admin.from("user_subscriptions").update({
      plan_id: "free",
      status: "active",
      subscription_provider: "stripe",
      patreon_member_id: null,
    }).eq("user_id", sub.user_id);
  }

  return ok();
});
