// Which model an agent call runs on, what it costs and what a credit is worth (#1205). One place, read by every
// function that makes such a call: a turn of the table (`agent-turn`), a sitting told as a story (`agent-recap`), a
// character's reply in chat (`character-reply`) and the campaign prep (`campaign-prep`).
// Moved here unchanged from `agent-turn/index.ts` when the second caller arrived.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptValue } from "../vault.ts";
import { loadCampaignKeys } from "../campaignKeys.ts";
import { fetchPlatformKeys } from "../platform-keys.ts";
import { fetchProviderConfigs } from "../provider-config.ts";
import { DEFAULT_TEXT_MODELS, resolveTextProvider } from "../textGen.ts";
import { anthropicModel } from "./anthropic.ts";
import { openaiModel } from "./openai.ts";
import type { ModelPrice } from "./metering.ts";
import type { CallModel } from "./types.ts";

export interface AgentProvider {
  provider: string;
  model: string;
  /** The campaign's own key pays. */
  isByok: boolean;
  /** Null when the provider has no adapter yet. */
  callModel: CallModel | null;
}

/**
 * The campaign's text provider, from its own keys (a Pro owner's only, read through `loadCampaignKeys`) and the
 * platform's, with the key the moderation screen should use. Null when no provider can answer.
 */
export async function resolveAgentProvider(
  admin: SupabaseClient,
  campaign: { id: string; ownerId: string; textProvider: string | null },
): Promise<{ provider: AgentProvider; moderationKey: string | null } | null> {
  const { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini } = await loadCampaignKeys(
    admin,
    { id: campaign.id, user_id: campaign.ownerId },
    decryptValue,
  );
  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);
  const text = resolveTextProvider({
    chosen: campaign.textProvider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return null;
  // The moderation endpoint is free; the platform's key is preferred so a campaign's own key is not used for it.
  const moderationKey = platformKeys.openai ?? campaignOpenai ?? null;
  // text_model is the platform's pick; `?? default` is the one place a nullable column means "use the default".
  const model = text.config?.text_model ?? DEFAULT_TEXT_MODELS[text.provider];
  let callModel: CallModel | null = null;
  if (text.provider === "openai") callModel = openaiModel(text.apiKey, model);
  else if (text.provider === "anthropic") callModel = anthropicModel(text.apiKey, model);
  return { provider: { provider: text.provider, model, isByok: text.isByok, callModel }, moderationKey };
}

/** What the model costs by the token, as the admin's price rows have it; null when it has no row or no price. */
export async function loadModelPrice(admin: SupabaseClient, model: string): Promise<ModelPrice | null> {
  const { data, error } = await admin
    .from("ai_model_pricing")
    .select("input_cost_per_million_tokens, output_cost_per_million_tokens, cached_input_cost_per_million_tokens")
    .eq("model", model)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const input = data.input_cost_per_million_tokens;
  const output = data.output_cost_per_million_tokens;
  if (input === null || output === null) return null;
  const cached = data.cached_input_cost_per_million_tokens;
  return {
    inputPerMillion: Number(input),
    outputPerMillion: Number(output),
    cachedInputPerMillion: cached === null ? null : Number(cached),
  };
}

/** What a credit is worth and the margin on top, as the admin set them; null when they are not set. */
export async function loadAgentCalibration(admin: SupabaseClient): Promise<{ usdPerCredit: number | null; margin: number } | null> {
  const { data, error } = await admin.rpc("agent_credit_calibration");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    usdPerCredit: row.usd_per_credit === null ? null : Number(row.usd_per_credit),
    margin: Number(row.margin),
  };
}
