import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const APP_URL = Deno.env.get("APP_URL") ?? "https://dungeongrimoire.com";

interface PatreonTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface PatreonMembership {
  id: string;
  attributes: {
    patron_status: string | null;
  };
  relationships?: {
    currently_entitled_tiers?: {
      data: Array<{ id: string; type: string }>;
    };
  };
}

interface PatreonIdentity {
  data: {
    id: string;
    attributes: {
      email: string;
      full_name: string;
    };
  };
  included?: PatreonMembership[];
}

async function exchangeCode(code: string, redirectUri: string): Promise<PatreonTokenResponse> {
  const res = await fetch("https://www.patreon.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: Deno.env.get("PATREON_CLIENT_ID")!,
      client_secret: Deno.env.get("PATREON_CLIENT_SECRET")!,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Patreon token exchange failed: ${await res.text()}`);
  return res.json();
}

async function fetchIdentity(accessToken: string): Promise<PatreonIdentity> {
  const res = await fetch(
    "https://www.patreon.com/api/oauth2/v2/identity" +
      "?fields[user]=email,full_name" +
      "&include=memberships,memberships.currently_entitled_tiers" +
      "&fields[member]=patron_status",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Patreon identity fetch failed: ${await res.text()}`);
  return res.json();
}

// Resolve which plan_id a set of entitled tier IDs maps to.
// Returns 'patron' if any tier matches; null if not a patron of a known tier.
async function resolvePlanForTiers(tierIds: string[]): Promise<string | null> {
  if (tierIds.length === 0) return null;
  const { data: plans } = await admin
    .from("plans")
    .select("id, patreon_tier_ids")
    .neq("id", "free");

  for (const plan of plans ?? []) {
    const mapped: string[] = plan.patreon_tier_ids ?? [];
    if (tierIds.some(t => mapped.includes(t))) return plan.id;
  }
  // Any paid patron defaults to patron plan even if tiers aren't mapped yet
  return "patron";
}

serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // JWT
  const error = url.searchParams.get("error");

  const redirect = (path: string) =>
    new Response(null, { status: 302, headers: { Location: `${APP_URL}${path}` } });

  if (error || !code || !state) {
    return redirect("/billing?patreon=cancelled");
  }

  try {
    // Verify the JWT to identify the user
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${state}` } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return redirect("/billing?patreon=error&reason=auth");

    const redirectUri = Deno.env.get("PATREON_REDIRECT_URI")!;
    const tokens = await exchangeCode(code, redirectUri);
    const identity = await fetchIdentity(tokens.access_token);

    const patreonUserId = identity.data.id;
    const patreonEmail = identity.data.attributes.email ?? null;
    const fullName = identity.data.attributes.full_name ?? null;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Collect entitled tier IDs from the membership includes
    const memberships: PatreonMembership[] = (identity.included ?? []).filter(
      (i): i is PatreonMembership => (i as PatreonMembership).attributes?.patron_status !== undefined,
    );
    const isActiveMember = memberships.some(
      m => m.attributes.patron_status === "active_patron",
    );
    const entitledTierIds = memberships.flatMap(
      m => m.relationships?.currently_entitled_tiers?.data.map(t => t.id) ?? [],
    );

    // Upsert connection record
    await admin.from("patreon_connections").upsert({
      user_id: user.id,
      patreon_user_id: patreonUserId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      patreon_email: patreonEmail,
      full_name: fullName,
    }, { onConflict: "user_id" });

    if (isActiveMember) {
      const planId = await resolvePlanForTiers(entitledTierIds);
      if (planId) {
        // Only upgrade to patron plan if user isn't already on Stripe
        const { data: sub } = await admin
          .from("user_subscriptions")
          .select("subscription_provider, plan_id")
          .eq("user_id", user.id)
          .single();

        if (!sub || sub.subscription_provider !== "stripe" || sub.plan_id === "free") {
          await admin.from("user_subscriptions").upsert({
            user_id: user.id,
            plan_id: planId,
            status: "active",
            subscription_provider: "patreon",
            patreon_member_id: `${patreonUserId}`,
          }, { onConflict: "user_id" });
        }
      }
    }

    return redirect("/billing?patreon=connected");
  } catch (err) {
    console.error("patreon-oauth-callback:", err);
    return redirect("/billing?patreon=error&reason=server");
  }
});
