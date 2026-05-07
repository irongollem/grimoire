/**
 * Fetches per-provider AI model config (model names + credit multipliers) from the DB.
 * Edge functions use this to resolve the active model and apply cost multipliers
 * instead of relying on hardcoded values.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import type { Provider } from "./platform-keys.ts";

export interface ProviderRow {
  text_model: string | null;
  image_model: string | null;
  text_multiplier: number | null;
  image_multiplier: number | null;
}

export async function fetchProviderConfigs(
  admin: SupabaseClient,
  providers: Provider[],
): Promise<Partial<Record<Provider, ProviderRow>>> {
  const { data } = await admin
    .from("provider_config")
    .select("provider, text_model, image_model, text_multiplier, image_multiplier")
    .in("provider", providers);

  if (!data?.length) return {};
  return Object.fromEntries(
    data.map((row: { provider: string } & ProviderRow) => [row.provider, row]),
  ) as Partial<Record<Provider, ProviderRow>>;
}

export function applyMultiplier(baseCost: number, multiplier: number | null | undefined): number {
  const m = multiplier ?? 1.0;
  return Math.round(baseCost * m * 100) / 100;
}
