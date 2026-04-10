import type { TextProvider, ImageProvider } from "./types";
import { createOpenAiTextProvider, createOpenAiImageProvider } from "./openai";
import { useCampaignStore } from "@/stores/campaign";

export type { TextProvider, ImageProvider };

function resolveKey(): string {
  const key = useCampaignStore().decryptedApiKey;
  if (!key)
    throw new Error(
      "No AI API key configured. Add one in Campaign Settings → AI.",
    );
  return key;
}

export function getTextProvider(): TextProvider {
  return createOpenAiTextProvider(resolveKey());
}

export function getImageProvider(): ImageProvider {
  return createOpenAiImageProvider(resolveKey());
}
