import type { TextProvider, ImageProvider } from "./types";
import { createOpenAiTextProvider, createOpenAiImageProvider } from "./openai";
import { createGeminiTextProvider, createGeminiImageProvider } from "./gemini";
import { createAnthropicTextProvider } from "./anthropic";
import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import { chooseImageProvider, chooseTextProvider, keysPresent, type ImageProviderKey } from "@edge-shared/providerChoice.ts";

export type { TextProvider, ImageProvider };

function resolveKey(provider: string): string {
  const store = useCampaignStore();
  const key = ({
    openai:       store.decryptedOpenAiKey,
    anthropic:    store.decryptedAnthropicKey,
    gemini:       store.decryptedGeminiKey,
  } as Record<string, string>)[provider] ?? "";
  if (!key)
    throw new Error(
      `No API key configured for ${provider}. Add one in Campaign Settings → AI.`,
    );
  return key;
}

/**
 * The local-key path runs in the browser on the DM's own keys only, so it is
 * the server's rule (chooseTextProvider) with no platform to fall back to: the
 * key `text_provider` names, else the one the DM holds.
 */
export function getTextProvider(): TextProvider {
  const store = useCampaignStore();
  const choice = chooseTextProvider({
    chosen: store.activeCampaign?.text_provider,
    ownKeys: {
      openai: !!store.decryptedOpenAiKey,
      anthropic: !!store.decryptedAnthropicKey,
      gemini: !!store.decryptedGeminiKey,
    },
    platformKeys: {},
    configs: {},
  });
  if (!choice) throw new Error("No API key configured. Add one in Campaign Settings → AI.");
  const provider = choice.provider;
  const key = resolveKey(provider);
  const make = (model: string): TextProvider => {
    switch (provider) {
      case "anthropic": return createAnthropicTextProvider(key, model);
      case "gemini":    return createGeminiTextProvider(key, model);
      default:          return createOpenAiTextProvider(key, model);
    }
  };
  // The model is read when a call is made, so callers keep a synchronous getter.
  return {
    async complete(...args) {
      return make(await fetchConfiguredModel(provider, "text_model")).complete(...args);
    },
  };
}

const PROVIDER_NAMES: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini" };

/**
 * The model an admin set in Admin → Providers. The local-key path calls the
 * provider from the browser and reads the setting here, so it follows the same
 * setting as the server path instead of a model baked into the client.
 */
async function fetchConfiguredModel(provider: string, column: "text_model" | "image_model"): Promise<string> {
  const { data, error } = await supabase
    .from("provider_config")
    .select(column)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  const model = (data as Record<string, string | null> | null)?.[column];
  if (!model) {
    const kind = column === "text_model" ? "text" : "image";
    throw new Error(`No ${PROVIDER_NAMES[provider] ?? provider} ${kind} model is configured. Ask an admin to set one in Admin → Providers.`);
  }
  return model;
}

/**
 * The image provider and key the local-key path renders with: the server's
 * rule (chooseImageProvider) on the DM's own keys, with no platform to fall
 * back to. Null when the campaign holds no image key.
 */
export function localImageChoice(): { provider: ImageProviderKey; apiKey: string } | null {
  const store = useCampaignStore();
  const keys = { openai: store.decryptedOpenAiKey, gemini: store.decryptedGeminiKey };
  const choice = chooseImageProvider({
    chosen: store.activeCampaign?.image_provider,
    ownKeys: keysPresent(keys),
    platformKeys: {},
    configs: {},
  });
  return choice ? { provider: choice.provider, apiKey: keys[choice.provider] } : null;
}

export async function getImageProvider(options: {
  /** A choice captured before an await (captureImageGenerationContext); omitted, the campaign's is resolved now. */
  imageProvider?: string | null;
  /** Captured local-vault key. Null means the captured campaign had no key. */
  apiKey?: string | null;
} = {}): Promise<ImageProvider> {
  const local = options.imageProvider === undefined ? localImageChoice() : null;
  const provider = options.imageProvider ?? local?.provider ?? null;
  const key = options.imageProvider === undefined ? local?.apiKey : options.apiKey;
  if (!provider || !key) {
    throw new Error("No image API key configured. Add one in Campaign Settings → AI.");
  }
  switch (provider) {
    case "gemini":       return createGeminiImageProvider(key, await fetchConfiguredModel("gemini", "image_model"));
    default:             return createOpenAiImageProvider(key, await fetchConfiguredModel("openai", "image_model"));
  }
}
