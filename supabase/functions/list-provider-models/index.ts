import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Per-provider list fetchers ────────────────────────────────────────────────

async function listOpenAiModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI models error ${res.status}`);
  const data = await res.json();
  return (data.data as { id: string }[])
    .map((m) => m.id)
    .sort();
}

async function listAnthropicModels(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`Anthropic models error ${res.status}`);
  const data = await res.json();
  return (data.data as { id: string }[])
    .map((m) => m.id)
    .sort();
}

async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );
  if (!res.ok) throw new Error(`Gemini models error ${res.status}`);
  const data = await res.json();
  // Strip "models/" prefix from the name field
  return (data.models as { name: string }[])
    .map((m) => m.name.replace(/^models\//, ""))
    .sort();
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  // Admin-only: verify the caller is authenticated and is a platform admin.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  const { data: adminUsers } = await admin.rpc("get_admin_users");
  const adminIds: string[] = (adminUsers ?? []).map((r: { user_id: string }) => r.user_id);
  if (!adminIds.includes(user.id)) return new Response("Forbidden", { status: 403, headers: corsHeaders });

  let provider: string;
  try {
    const body = await req.json();
    provider = body.provider;
    if (!provider) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { provider }", { status: 400, headers: corsHeaders });
  }

  const keys = await fetchPlatformKeys(admin, [provider as "openai" | "anthropic" | "gemini" | "falai"]);
  const apiKey = keys[provider as keyof typeof keys];
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "no_key", message: "No platform API key configured for this provider" }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    let models: string[];
    if (provider === "openai") {
      models = await listOpenAiModels(apiKey);
    } else if (provider === "anthropic") {
      models = await listAnthropicModels(apiKey);
    } else if (provider === "gemini") {
      models = await listGeminiModels(apiKey);
    } else {
      return new Response(
        JSON.stringify({ error: "unsupported_provider" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

    }

    return new Response(
      JSON.stringify({ models }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(`list-provider-models failed for ${provider}:`, e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Failed to list models" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
