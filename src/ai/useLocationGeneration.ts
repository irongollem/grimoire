import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import {
  LOCATION_SYSTEM_PROMPT,
  IMAGE_BASE_PROMPT,
  buildCampaignContext,
  INJECTION_GUARD_SUFFIX,
} from "./prompts";
import type { LocationAiResult, LocationAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider, getImageProvider } from "./providers";
import { b64ToBlob, wrapUserInput } from "./utils";
import { useCampaignStore } from "@/stores/campaign";

const MAP_BASE_PROMPT =
  "Top-down fantasy cartography map. Hand-drawn ink style, bird's-eye view, clean linework, labeled zones, hatching for walls and elevation, minimal colour. Readable as a functional map, not a painting.";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Location",
  entityRoute: (id) => `/locations/${id}`,
  openPanel: () => {
    useUiStore().locationGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface LocationGenerationOptions {
  location_type?: string;
  parent_name?: string;
  generateImage?: boolean;
  generateMap?: boolean;
}

export function useLocationGeneration() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options?: LocationGenerationOptions,
  ): Promise<LocationAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";

    try {
      const textProvider = getTextProvider();
      const imageProvider = getImageProvider();

      const systemContent = `${LOCATION_SYSTEM_PROMPT}${buildCampaignContext({
        setting: settingPrompt,
      })}${INJECTION_GUARD_SUFFIX}`;

      const constraints: string[] = [];
      if (options?.location_type) constraints.push(`Location Type: ${options.location_type}`);
      if (options?.parent_name) constraints.push(`Parent Location: ${options.parent_name}`);

      const wrappedPrompt = wrapUserInput(userPrompt);
      const userContent = constraints.length
        ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : wrappedPrompt;

      const locationData = JSON.parse(
        await textProvider.complete(systemContent, userContent),
      ) as LocationAiResult;

      // ── Art + map in parallel ───────────────────────────────────────────────
      if (options?.generateImage !== false || options?.generateMap) {
        startAiQuotes("image");
      }

      const [image_url, map_url] = await Promise.all([
        (async (): Promise<string | null> => {
          if (options?.generateImage === false || !auth.user) return null;
          try {
            const imagePrompt = [IMAGE_BASE_PROMPT, settingPrompt, locationData.image_prompt]
              .filter(Boolean)
              .join(" — ");
            const b64 = await imageProvider.generate(imagePrompt, "1024x1024");
            if (!b64) return null;
            return await uploadWithVariants({
              bucket: "locationImages",
              userId: auth.user.id,
              blob: b64ToBlob(b64),
            });
          } catch {
            return null;
          }
        })(),
        (async (): Promise<string | null> => {
          if (!options?.generateMap || !auth.user) return null;
          try {
            const mapPrompt = [MAP_BASE_PROMPT, locationData.map_prompt]
              .filter(Boolean)
              .join(" — ");
            const b64 = await imageProvider.generate(mapPrompt, "1024x1024");
            if (!b64) return null;
            return await uploadWithVariants({
              bucket: "locationImages",
              userId: auth.user.id,
              blob: b64ToBlob(b64),
            });
          } catch {
            return null;
          }
        })(),
      ]);

      return { ...locationData, image_url, map_url };
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  return { ..._state, generate };
}
