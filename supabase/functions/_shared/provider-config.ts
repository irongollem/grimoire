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
  /** The AI map styler's image model; NULL = image_model. See resolveImageProvider's `surface`. */
  map_style_model: string | null;
  /** Chronicler scenes' and group portraits' image model; NULL = image_model. */
  chronicle_image_model: string | null;
  /**
   * Model for document/image extraction (#353). Separate from `text_model`
   * because reading a document is a distinct capability: on Anthropic the
   * text model is Haiku 4.5 and the document model is Opus 5.
   * NULL means this provider is not available for document extraction — treat
   * it as unsupported rather than falling back to `text_model`, which is the
   * exact mistake the column exists to prevent.
   */
  document_model: string | null;
  text_multiplier: number | null;
  image_multiplier: number | null;
  /**
   * Model for latency-sensitive, many-turn features — the quest designer
   * (#873) is the first consumer. NULL means "use text_model": unlike
   * `document_model`, a missing fast tier is not an unsupported capability,
   * just an admin who hasn't picked one yet, so callers fall back rather
   * than refusing.
   */
  fast_text_model: string | null;
  /** Admin → Providers: whether platform-key text calls may run on this provider. See resolveTextProvider. */
  text_enabled: boolean;
  /** Admin → Providers: whether platform-key campaigns may render on this provider. See resolveImageProvider. */
  image_enabled: boolean;
}

let providerCache: Partial<Record<Provider, ProviderRow>> | null = null;
let providerCacheExpiry = 0;
const PROVIDER_TTL_MS = 5 * 60 * 1000;

export async function fetchProviderConfigs(
  admin: SupabaseClient,
  providers: Provider[],
): Promise<Partial<Record<Provider, ProviderRow>>> {
  if (!providerCache || Date.now() >= providerCacheExpiry) {
    // A failed read throws: swallowed, it read as "nothing configured" and every
    // function fell back to its hard-coded defaults without a word.
    const { data, error } = await admin
      .from("provider_config")
      .select("provider, text_model, image_model, map_style_model, chronicle_image_model, image_quality, document_model, text_multiplier, image_multiplier, fast_text_model, text_enabled, image_enabled");
    if (error) throw error;
    providerCache = Object.fromEntries(
      data.map((row: { provider: string } & ProviderRow) => [row.provider, row]),
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
