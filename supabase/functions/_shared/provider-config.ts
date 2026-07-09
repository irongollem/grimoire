/**
 * Fetches per-provider AI model config (model names + credit multipliers) from the DB.
 * Edge functions use this to resolve the active model and apply cost multipliers
 * instead of relying on hardcoded values.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider } from "./platform-keys.ts";

export interface ProviderRow {
  text_model: string | null;
  image_model: string | null;
  image_quality: string | null;
  text_multiplier: number | null;
  image_multiplier: number | null;
}

let providerCache: Partial<Record<Provider, ProviderRow>> | null = null;
let providerCacheExpiry = 0;
const PROVIDER_TTL_MS = 5 * 60 * 1000;

export async function fetchProviderConfigs(
  admin: SupabaseClient,
  providers: Provider[],
): Promise<Partial<Record<Provider, ProviderRow>>> {
  if (!providerCache || Date.now() >= providerCacheExpiry) {
    const { data } = await admin
      .from("provider_config")
      .select("provider, text_model, image_model, image_quality, text_multiplier, image_multiplier");
    providerCache = Object.fromEntries(
      (data ?? []).map((row: { provider: string } & ProviderRow) => [row.provider, row]),
    ) as Partial<Record<Provider, ProviderRow>>;
    providerCacheExpiry = Date.now() + PROVIDER_TTL_MS;
  }
  return Object.fromEntries(
    providers.flatMap((p) => (p in providerCache! ? [[p, providerCache![p]!]] : [])),
  ) as Partial<Record<Provider, ProviderRow>>;
}

export function applyMultiplier(baseCost: number, multiplier: number | null | undefined): number {
  const m = multiplier ?? 1.0;
  return Math.round(baseCost * m * 100) / 100;
}
