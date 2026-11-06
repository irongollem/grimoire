import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { decryptValue, encryptValue } from "../_shared/vault.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_VALUE_LENGTH = 16_384;

// Campaign columns that hold an encrypted BYOK key.
const CAMPAIGN_KEY_COLUMNS = [
  "openai_api_key",
  "anthropic_api_key",
  "gemini_api_key",
] as const;

/**
 * Is `blob` a ciphertext the caller is actually allowed to decrypt?
 * - Any of the caller's own campaigns' BYOK key columns, OR
 * - (admins only) a stored platform_api_keys ciphertext.
 * Prevents this endpoint from being a decryption oracle for keys the caller
 * could never read through RLS.
 */
async function callerOwnsBlob(
  admin: SupabaseClient,
  userId: string,
  isAdmin: boolean,
  blob: string,
): Promise<boolean> {
  // Columns are joined at runtime, so PostgREST cannot infer the row shape.
  const { data: campaigns } = await admin
    .from("campaigns")
    .select(CAMPAIGN_KEY_COLUMNS.join(", "))
    .eq("user_id", userId)
    .overrideTypes<Record<string, string | null>[], { merge: false }>();
  for (const row of campaigns ?? []) {
    if (CAMPAIGN_KEY_COLUMNS.some((col) => row[col] === blob)) return true;
  }
  if (isAdmin) {
    const { data: platformKeys } = await admin
      .from("platform_api_keys")
      .select("encrypted_key");
    if ((platformKeys ?? []).some((r: { encrypted_key: string }) => r.encrypted_key === blob)) {
      return true;
    }
  }
  return false;
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Allow": "POST, OPTIONS" },
    });
  }

  // Require an authenticated caller — this endpoint holds the master vault key.
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

    let result: string;

    if (action === "encrypt") {
      // Any authenticated user may encrypt their own key. Whether it can then be
      // *stored* is gated separately by RLS + the BYOK Pro-only trigger.
      result = await encryptValue(value);
    } else if (action === "decrypt") {
      // Only decrypt ciphertext the caller is entitled to (their own campaign
      // keys, or platform keys for admins). Never a blind decryption oracle.
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      if (!value.startsWith("enc:v1:")) {
        // Not a vault ciphertext — reject rather than echo arbitrary input back.
        return new Response(JSON.stringify({ error: "Invalid ciphertext" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      } else if (await callerOwnsBlob(admin, user.id, isAdmin, value)) {
        result = await decryptValue(value);
      } else {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

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
