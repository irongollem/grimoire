import { supabase } from "@/lib/supabase";

// Session-scoped cache: encrypted blob → decrypted plaintext.
// Avoids a cold edge function call every time switchToCampaign() fires
// (app load, campaign save, layout mount, …).
const decryptCache = new Map<string, string>();

/**
 * Pre-populate the decrypt cache with a known plaintext.
 * Call this after encryptApiKey() so the immediately following
 * switchToCampaign() decrypt is a no-op.
 */
export function primeDecryptCache(encrypted: string, plaintext: string): void {
  if (encrypted) decryptCache.set(encrypted, plaintext);
}

/**
 * Encrypt an API key using the Supabase Edge Function.
 * Returns a string in format: enc:v1:<base64_iv>:<base64_ciphertext>
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
  if (!plaintext) return "";

  const {
    data,
    error,
  } = await supabase.functions.invoke("api-key-vault", {
    body: { action: "encrypt", value: plaintext },
  });

  if (error) {
    throw new Error(`Failed to encrypt API key: ${error.message}`);
  }

  return data.result;
}

/**
 * Decrypt an API key using the Supabase Edge Function.
 * If the value doesn't start with "enc:v1:", it's treated as legacy plaintext and returned as-is.
 */
export async function decryptApiKey(encrypted: string): Promise<string> {
  if (!encrypted) return "";

  // Legacy plaintext passthrough — no edge function call needed
  if (!encrypted.startsWith("enc:v1:")) {
    return encrypted;
  }

  // Return cached result if we've already decrypted this blob this session
  const cached = decryptCache.get(encrypted);
  if (cached !== undefined) return cached;

  const {
    data,
    error,
  } = await supabase.functions.invoke("api-key-vault", {
    body: { action: "decrypt", value: encrypted },
  });

  if (error) {
    throw new Error(`Failed to decrypt API key: ${error.message}`);
  }

  decryptCache.set(encrypted, data.result);
  return data.result;
}
