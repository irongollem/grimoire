import type { TextProvider, ImageProvider } from "./types";
import { createOpenAiTextProvider, createOpenAiImageProvider } from "./openai";
import { createGeminiTextProvider } from "./gemini";
import { useCampaignStore } from "@/stores/campaign";

export type { TextProvider, ImageProvider };

function resolveImageKey(): string {
  const key = useCampaignStore().decryptedApiKey;
  if (!key)
    throw new Error(
      "No image AI API key configured. Add one in Campaign Settings → AI.",
    );
  return key;
}

function resolveTextKey(): string {
  const store = useCampaignStore();
  // Use dedicated text key if set, otherwise fall back to image key for backward compat
  const key = store.decryptedTextApiKey || store.decryptedApiKey;
  if (!key)
    throw new Error(
      "No text AI API key configured. Add one in Campaign Settings → AI.",
    );
  return key;
}

function buildTextProvider(key: string): TextProvider {
  // Gemini keys start with "AIza"
  if (key.startsWith("AIza")) return createGeminiTextProvider(key);
  return createOpenAiTextProvider(key);
}

export function getTextProvider(): TextProvider {
  return buildTextProvider(resolveTextKey());
}

export function getImageProvider(): ImageProvider {
  return createOpenAiImageProvider(resolveImageKey());
}
