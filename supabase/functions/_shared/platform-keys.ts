/**
 * Fetches platform-level API keys from the platform_api_keys table.
 * Used as fallback when a campaign has no BYOK key configured.
 * Keys are stored encrypted; this returns them already decrypted.
 */
import { decryptValue } from "./vault.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

// "meshy" has no row in platform_api_keys until the Simulacrum go-live
// (SIMULACRUM_PLAN.md §7 Phase 4) — fetchPlatformKeys simply omits it from
// the returned record until then, so existing callers are unaffected.
// "github" holds the fine-grained PAT used by create-bug-report to file
// issues — not an AI provider, but reuses the same encrypted-at-rest vault.
// "typesafe" holds the TypeSafe API key for the Jev judgment model (#1061).
// "elevenlabs" and "inworld" hold the speech services' keys (#1021, `speech.ts`).
export type Provider = "openai" | "anthropic" | "gemini" | "meshy" | "github" | "typesafe" | "elevenlabs" | "inworld";

export async function fetchPlatformKeys(
  admin: SupabaseClient,
  providers: Provider[],
): Promise<Partial<Record<Provider, string>>> {
  const { data, error } = await admin
    .from("platform_api_keys")
    .select("provider, encrypted_key")
    .in("provider", providers);
  // A read that failed is not "no key": answering {} would quietly run every caller on its no-key path.
  if (error) throw error;

  if (!data?.length) return {};

  const entries = await Promise.all(
    data.map(async (row: { provider: string; encrypted_key: string }) => {
      try {
        const key = await decryptValue(row.encrypted_key);
        return [row.provider, key] as [Provider, string];
      } catch {
        return null;
      }
    }),
  );

  return Object.fromEntries(entries.filter(Boolean) as [Provider, string][]);
}
