/**
 * Provider-neutral image quality, set per generation type beside its credit
 * price in Admin -> Pricing (ai_generation_credit_costs.image_quality_tier)
 * instead of the old single knob per provider (provider_config.image_quality).
 *
 * The tier is provider-neutral (low / standard / high) so a campaign that
 * switches image provider keeps the same intent — "low" always means "a
 * tile", "high" always means "a table-TV map" — whichever provider renders
 * it. A generation type with no tier set (null) falls back to the provider's
 * own default, exactly the behaviour every type had before this column
 * existed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchImageQualityTier } from "./credits.ts";

export type ImageQualityTier = "low" | "standard" | "high";

function isImageQualityTier(value: string | null): value is ImageQualityTier {
  return value === "low" || value === "standard" || value === "high";
}

/** OpenAI gpt-image `quality` values (see imageGen.ts's OPENAI_QUALITIES). */
const OPENAI_QUALITY: Record<ImageQualityTier, string> = {
  low: "low",
  standard: "medium",
  high: "high",
};

/** Gemini `imageConfig.imageSize` values (see imageGen.ts's GEMINI_IMAGE_SIZES). */
const GEMINI_QUALITY: Record<ImageQualityTier, string> = {
  low: "1K",
  standard: "2K",
  high: "4K",
};

/** Map a provider-neutral tier to the value the given provider's API accepts. */
export function providerQualityFor(tier: ImageQualityTier, base: "openai" | "gemini"): string {
  return base === "gemini" ? GEMINI_QUALITY[tier] : OPENAI_QUALITY[tier];
}

/**
 * Resolve the `quality` lever to hand to generateImage() (and to record in
 * the credit ledger) for one generation type: the admin-set tier mapped to
 * this call's own provider, or — when no tier is set for this generation
 * type — the provider's own default (`img.imageQuality`, sourced from
 * provider_config.image_quality by resolveImageProvider). Reads through
 * fetchImageQualityTier, which shares fetchCreditCost's cached row, so this
 * costs no extra query.
 */
export async function resolveImageQuality(
  admin: SupabaseClient,
  generationType: string,
  img: { base: "openai" | "gemini"; imageQuality: string | null },
): Promise<string | null> {
  const raw = await fetchImageQualityTier(admin, generationType);
  return isImageQualityTier(raw) ? providerQualityFor(raw, img.base) : img.imageQuality;
}
