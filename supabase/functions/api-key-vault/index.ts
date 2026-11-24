import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { encryptValue } from "../_shared/vault.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MAX_VALUE_LENGTH = 16_384;

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Allow": "POST, OPTIONS" },
    });
  }

  // Require an authenticated caller: this endpoint holds the master vault key.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const isAdmin = (user.app_metadata as { role?: string } | null)?.role === "admin";

  try {
    const body = await req.json();
    const { action, value } = body;

    if (!action || !value || typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
      return new Response(JSON.stringify({ error: "Missing or invalid action/value" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only the admin's platform keys are ever encrypted here (Admin -> Providers). The vault holds the master key,
    // so no one else gets to use it, and nothing decrypts: the platform's keys are read server-side only.
    if (action !== "encrypt") {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const result = await encryptValue(value);

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}));
