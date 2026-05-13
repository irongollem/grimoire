import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const clientId = Deno.env.get("PATREON_CLIENT_ID");
    const redirectUri = Deno.env.get("PATREON_REDIRECT_URI");
    if (!clientId || !redirectUri) {
      return json({ error: "Patreon not configured" }, 500);
    }

    // Pass the raw JWT as state so the callback can verify identity
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "identity identity[email] memberships",
      state: jwt,
    });

    return json({ url: `https://www.patreon.com/oauth2/authorize?${params}` });
  } catch (err) {
    console.error("patreon-link-url:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
