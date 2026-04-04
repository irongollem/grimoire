import { supabase } from "./supabase";

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

  const {
    data,
    error,
  } = await supabase.functions.invoke("api-key-vault", {
    body: { action: "decrypt", value: encrypted },
  });

  if (error) {
    throw new Error(`Failed to decrypt API key: ${error.message}`);
  }

  return data.result;
}
