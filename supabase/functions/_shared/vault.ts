/**
 * Shared AES-GCM vault helpers for Edge Functions.
 * Uses the VAULT_KEY environment variable (32-byte hex string).
 *
 * Mirrors the encryption logic in api-key-vault/index.ts.
 * Import this instead of calling api-key-vault over HTTP.
 */

const VAULT_KEY_HEX = Deno.env.get("VAULT_KEY");
if (!VAULT_KEY_HEX) throw new Error("VAULT_KEY environment variable not set");

const vaultKeyBytes = new Uint8Array(
  VAULT_KEY_HEX.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
);
if (vaultKeyBytes.length !== 32) {
  throw new Error(`VAULT_KEY must be 32 bytes (64 hex chars), got ${vaultKeyBytes.length}`);
}

async function importKey(usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", vaultKeyBytes, { name: "AES-GCM" }, false, [usage]);
}

export async function encryptValue(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey("encrypt");
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `enc:v1:${ivB64}:${ctB64}`;
}

export async function decryptValue(encrypted: string): Promise<string> {
  // No legacy plaintext exists (verified); a non-enc value is malformed, not a
  // passthrough — reject so this never silently returns un-decrypted input.
  if (!encrypted.startsWith("enc:v1:")) throw new Error("Invalid ciphertext format");
  const parts = encrypted.split(":");
  if (parts.length !== 4) throw new Error("Invalid encrypted format");
  const [, , ivB64, ctB64] = parts;
  const iv = new Uint8Array(atob(ivB64).split("").map((c) => c.charCodeAt(0)));
  const ciphertext = new Uint8Array(atob(ctB64).split("").map((c) => c.charCodeAt(0)));
  const key = await importKey("decrypt");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
