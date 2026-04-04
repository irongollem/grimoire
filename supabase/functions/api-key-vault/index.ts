import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

const VAULT_KEY_HEX = Deno.env.get("VAULT_KEY");
if (!VAULT_KEY_HEX) {
  throw new Error("VAULT_KEY environment variable not set");
}

const vaultKey = new Uint8Array(
  VAULT_KEY_HEX.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
);

if (vaultKey.length !== 32) {
  throw new Error(`VAULT_KEY must be 32 bytes (64 hex chars), got ${vaultKey.length}`);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

async function encryptValue(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate random 12-byte IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Import the vault key as a crypto key
  const key = await crypto.subtle.importKey("raw", vaultKey, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);

  // Encrypt with AES-GCM
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

  // Format: enc:v1:<base64_iv>:<base64_ciphertext>
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const ctBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

  return `enc:v1:${ivBase64}:${ctBase64}`;
}

async function decryptValue(encrypted: string): Promise<string> {
  // Check if it's encrypted format; if not, treat as legacy plaintext
  if (!encrypted.startsWith("enc:v1:")) {
    return encrypted;
  }

  const parts = encrypted.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted format");
  }

  const [, , ivBase64, ctBase64] = parts;

  // Decode base64
  const iv = new Uint8Array(atob(ivBase64).split("").map((c) => c.charCodeAt(0)));
  const ciphertext = new Uint8Array(atob(ctBase64).split("").map((c) => c.charCodeAt(0)));

  // Import the vault key as a crypto key
  const key = await crypto.subtle.importKey("raw", vaultKey, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);

  // Decrypt with AES-GCM
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}


serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request
    const body = await req.json();
    const { action, value } = body;

    if (!action || !value || typeof value !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid action/value" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let result: string;

    if (action === "encrypt") {
      result = await encryptValue(value);
    } else if (action === "decrypt") {
      result = await decryptValue(value);
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
