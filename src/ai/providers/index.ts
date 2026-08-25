import type { TextProvider, ImageProvider } from "./types";
import { createOpenAiTextProvider, createOpenAiImageProvider } from "./openai";
import { createGeminiTextProvider, createGeminiImageProvider } from "./gemini";
import { createAnthropicTextProvider } from "./anthropic";
import { useCampaignStore } from "@/stores/campaign";

export type { TextProvider, ImageProvider };

function resolveKey(provider: string): string {
  const store = useCampaignStore();
  const key = ({
    openai:       store.decryptedOpenAiKey,
    "openai-mini": store.decryptedOpenAiKey,
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

export const OPENAI_IMAGE_MODEL_KEY = "grimoire_openai_image_model";

export function getImageProvider(options: {
  imageProvider?: string | null;
  imageModel?: string;
  /** Captured local-vault key. Null means the captured campaign had no key. */
  apiKey?: string | null;
} = {}): ImageProvider {
  const provider = options.imageProvider ?? useCampaignStore().activeCampaign?.image_provider ?? "openai";
  const key = options.apiKey === undefined ? resolveKey(provider) : (options.apiKey ?? "");
  if (!key) {
    throw new Error(
      `No API key configured for ${provider}. Add one in Campaign Settings → AI.`,
    );
  }
  switch (provider) {
    case "gemini":       return createGeminiImageProvider(key);
    case "openai-mini":  return createOpenAiImageProvider(key, "gpt-image-1-mini");
    default: {
      const model = options.imageModel ?? (typeof localStorage !== "undefined" ? localStorage.getItem(OPENAI_IMAGE_MODEL_KEY) : null) ?? "gpt-image-2";
      return createOpenAiImageProvider(key, model as "gpt-image-2" | "gpt-image-1.5");
    }
  }
}
