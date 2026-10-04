import type { TextProvider, ImageProvider } from "./types";
import { createOpenAiTextProvider, createOpenAiImageProvider } from "./openai";
import { createGeminiTextProvider, createGeminiImageProvider } from "./gemini";
import { createAnthropicTextProvider } from "./anthropic";
import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";

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

export function getTextProvider(): TextProvider {
  const provider = useCampaignStore().activeCampaign?.text_provider ?? "openai";
  const key = resolveKey(provider);
  switch (provider) {
    case "anthropic": return createAnthropicTextProvider(key);
    case "gemini":    return createGeminiTextProvider(key);
    default:          return createOpenAiTextProvider(key);
  }
}

/**
 * The OpenAI image model an admin set in Admin → Providers. The local-key path
 * renders in the browser and reads it here, so it follows the same setting as
 * the server path instead of a model baked into the client.
 */
async function fetchOpenAiImageModel(): Promise<string> {
  const { data, error } = await supabase
    .from("provider_config")
    .select("image_model")
    .eq("provider", "openai")
    .maybeSingle();
  if (error) throw error;
  if (!data?.image_model) throw new Error("No OpenAI image model is configured. Ask an admin to set one in Admin → Providers.");
  return data.image_model;
}

export async function getImageProvider(options: {
  imageProvider?: string | null;
  /** Captured local-vault key. Null means the captured campaign had no key. */
  apiKey?: string | null;
} = {}): Promise<ImageProvider> {
  const provider = options.imageProvider ?? useCampaignStore().activeCampaign?.image_provider ?? "openai";
  const key = options.apiKey === undefined ? resolveKey(provider) : (options.apiKey ?? "");
  if (!key) {
    throw new Error(
      `No API key configured for ${provider}. Add one in Campaign Settings → AI.`,
    );
  }
  switch (provider) {
    case "gemini":       return createGeminiImageProvider(key);
    default:             return createOpenAiImageProvider(key, await fetchOpenAiImageModel());
  }
}
