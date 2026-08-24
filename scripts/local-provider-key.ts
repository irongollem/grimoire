/**
 * Loads a local provider API key into `platform_api_keys` so the document
 * importer (#353) can be exercised end to end against the local stack.
 *
 * The `platform_api_keys` rows that arrive with seed.sql are encrypted with
 * *production's* VAULT_KEY, which is not on this machine and should never be —
 * so they cannot be decrypted locally, which is the correct outcome. A local run
 * therefore needs its own key under its own locally-generated VAULT_KEY.
 *
 * Reads the plaintext key from `supabase/functions/.env` (gitignored), encrypts
 * it with the VAULT_KEY from that same file using the identical AES-GCM scheme
 * as `supabase/functions/_shared/vault.ts`, and upserts the `anthropic` row.
 * The key is never printed, never passed as an argument (so it stays out of
 * shell history and `ps`), and never leaves this machine.
 *
 * Local only, by construction: it refuses any DB URL that is not loopback, the
 * same guard `scripts/dev-auth.ts` uses and for the same reason — this writes a
 * credential, and writing one to the hosted project from a dev script is not a
 * thing that should be one typo away.
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/local-provider-key.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { quote, sql } from "./lib/dev-db.ts";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function assertLoopback(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(`Refusing to write a credential to a non-loopback database (${host}).`);
  }
}

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  // A missing file is a normal case (not every checkout has both), not an error.
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const value = trimmed.slice(eq + 1);
    if (value) out[trimmed.slice(0, eq)] = value;
  }
  return out;
}

/** Byte-for-byte the format `_shared/vault.ts` expects: `enc:v1:<iv b64>:<ct b64>`. */
async function encryptValue(plaintext: string, vaultKeyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(vaultKeyHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  if (keyBytes.length !== 32) {
    throw new Error(`VAULT_KEY must be 32 bytes (64 hex chars), got ${keyBytes.length}`);
  }
  const key = await webcrypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
  return `enc:v1:${b64(iv)}:${b64(new Uint8Array(ct))}`;
}

async function main(): Promise<void> {
  assertLoopback(DB_URL);

  // Two sources, merged. `supabase/functions/.env` is this script's own file
  // (and the one the local edge runtime reads), but the project's real provider
  // keys already live in `.env.local` — so read that too rather than making
  // anyone copy a secret into a second file, which only creates a second place
  // to leak it from. `functions/.env` wins where both define a key, so a
  // deliberate local override still works.
  const env = { ...readEnvFile(".env.local"), ...readEnvFile("supabase/functions/.env") };
  const vaultKey = env.VAULT_KEY;
  if (!vaultKey) throw new Error("VAULT_KEY missing from supabase/functions/.env");

  // Provider-agnostic on purpose: this platform runs OpenAI, but the importer
  // dispatches through the connector, so any provider with a `document_model`
  // configured is testable the same way. Whichever key is present wins; if both
  // are, the explicit PROVIDER wins.
  const candidates: { provider: string; key: string | undefined; prefix: string }[] = [
    { provider: "openai", key: env.OPENAI_API_KEY, prefix: "sk-" },
    { provider: "anthropic", key: env.ANTHROPIC_API_KEY, prefix: "sk-ant-" },
    { provider: "gemini", key: env.GEMINI_API_KEY, prefix: "" },
  ];
  const wanted = env.PROVIDER;
  const chosen = candidates.find((c) => (wanted ? c.provider === wanted : false) && c.key)
    ?? candidates.find((c) => c.key);

  if (!chosen || !chosen.key) {
    throw new Error(
      "No provider key found in supabase/functions/.env — set OPENAI_API_KEY (or ANTHROPIC_API_KEY / GEMINI_API_KEY) and re-run.",
    );
  }
  // Cheap shape check: a wrong-provider key fails much later, inside a paid
  // call, with an error that does not say "you used the wrong key".
  if (chosen.prefix && !chosen.key.startsWith(chosen.prefix)) {
    throw new Error(`That does not look like a ${chosen.provider} key (expected it to start with '${chosen.prefix}').`);
  }
  const provider = chosen.provider;
  const apiKey = chosen.key;

  const encrypted = await encryptValue(apiKey, vaultKey);

  // Via psql through the same helper the other dev-fixture scripts use, rather
  // than adding a Postgres driver to package.json for one local script.
  sql(
    DB_URL,
    `insert into platform_api_keys (provider, encrypted_key)
     values (${quote(provider)}, ${quote(encrypted)})
     on conflict (provider) do update set encrypted_key = excluded.encrypted_key`,
  );

  const rows = sql(DB_URL, "select provider, length(encrypted_key) from platform_api_keys order by provider");
  console.log("platform_api_keys now holds:");
  for (const line of rows.split("\n")) {
    const [provider, len] = line.split("\t");
    console.log(`  ${provider} (${len} chars, encrypted)`);
  }
  console.log(`\nThe ${provider} row is encrypted with the VAULT_KEY in supabase/functions/.env.`);
  console.log("Both are local-only and gitignored. Nothing was printed in plaintext.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
