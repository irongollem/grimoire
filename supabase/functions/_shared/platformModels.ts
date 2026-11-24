/**
 * Every AI model id the code names, in one place.
 *
 * Which model a feature runs on is a setting, not code: `provider_config` in the
 * database, edited in Admin → Providers, read by the server and by the browser. Code needs ids only where a setting is empty (the
 * fallbacks), where a caller is fixed to one model on purpose (the paper doll),
 * in scripts, as suggestions in the admin panel, and in the rules for what a
 * request may send. Until 16 Nov 2026 those ids were copied into a dozen files
 * and an upgrade meant hunting for all of them; `platformModels.test.ts` now
 * fails if a model id is written anywhere else in code.
 *
 * Moving to new models:
 *   1. In Admin → Providers, point the settings at the new models and try them.
 *      That alone switches every feature that has a setting.
 *   2. Change the ids below, so the fallbacks and scripts follow. If a new model
 *      starts a new family, add it to the family lists too (does it take a
 *      reasoning effort, does it accept any image size?), from its page on the
 *      provider's site.
 *   3. `/new-migration`: price each new id in `ai_model_pricing` (keep the old
 *      rows, they price history) and set `provider_config` to what the panel
 *      now holds, so a rebuilt database matches production.
 *   4. Update `supabase/tests/openai_model_refresh.test.sql` (the pinned
 *      settings) and the model list in `model_pricing_coverage.test.sql` (the
 *      suite says so if you forget).
 *   5. Compare cost per image in `ai_generation_costs`, never by rate card.
 */

// ── OpenAI ──────────────────────────────────────────────────────────────────

/** Text and document reading. */
export const OPENAI_TEXT_MODEL = "gpt-6-luna";

/** Looser and faster pictures: entity art, the Chronicler. */
export const OPENAI_IMAGE_FLARE = "gpt-image-2.6-flare";

/**
 * Pictures that must follow the brief exactly: the map styler, brush tips,
 * Cartographer tiles (much better on sunburst than flare) and the paper doll.
 */
export const OPENAI_IMAGE_SUNBURST = "gpt-image-2.6-sunburst";

// ── Anthropic and Gemini ────────────────────────────────────────────────────

export const ANTHROPIC_TEXT_MODEL = "claude-haiku-4-5";
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

// ── Suggestions in Admin → Providers ────────────────────────────────────────

/**
 * Audio models per provider. No backend generates audio with OpenAI, so it is
 * absent: listing a model would imply a path that does not exist. Lyria 3.5 is
 * priced flat per song regardless of length.
 */
export const KNOWN_AUDIO_MODELS: Record<string, string[]> = {
  gemini: ["lyria-3.5"],
};

/**
 * Embedding models per provider (#595). Only OpenAI and Gemini can embed;
 * Anthropic has no embeddings endpoint.
 */
export const KNOWN_EMBEDDING_MODELS: Record<string, string[]> = {
  openai: ["text-embedding-3-small", "text-embedding-3-large"],
  gemini: ["gemini-embedding-001"],
};

// ── What a request may send ─────────────────────────────────────────────────

/**
 * OpenAI families that take a reasoning effort. A family matches its exact name
 * or its name plus a variant ("gpt-6-luna"), never a bare prefix, so "gpt-5.60"
 * or "gpt-60" is not in one. gpt-6 defaults to medium effort when none is sent,
 * which costs more tokens than the platform's text needs, so callers send low.
 */
const OPENAI_REASONING_FAMILIES = ["gpt-5.6", "gpt-6"];

/**
 * OpenAI families that accept an arbitrary image size (per OpenAI's
 * image-generation guide: multiples of 16, 1:3 to 3:1, at most 3840 a side).
 * gpt-image-2 and older take a short fixed list of sizes instead.
 */
const OPENAI_FLEXIBLE_IMAGE_FAMILIES = ["gpt-image-2.5", "gpt-image-2.6"];

export function isOpenAiReasoningModel(model: string): boolean {
  return OPENAI_REASONING_FAMILIES.some((family) => model === family || model.startsWith(`${family}-`));
}

/**
 * Whether an OpenAI image model accepts an arbitrary output size.
 * `style-map/index.ts` uses this to reject a flexible-sized upload before it
 * reaches a model that would refuse it: the client always sends a
 * flexible-fitted image for the "openai" provider, since it cannot see which
 * model the admin has configured.
 */
export function isFlexibleOpenAiModel(model: string): boolean {
  return OPENAI_FLEXIBLE_IMAGE_FAMILIES.some((family) => model.startsWith(family));
}
