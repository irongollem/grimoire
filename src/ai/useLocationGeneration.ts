import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/useRuleset";
import type { LocationAiResult, LocationAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider } from "./providers";
import { wrapUserInput } from "./utils";
import { logUsage } from "@/composables/useAiCredits";
import {
  captureImageGenerationContext,
  generateImage,
  type ImageGenerationContext,
} from "@/ai/useImageGeneration";
import { buildAiProvenance } from "@/ai/provenance";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

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
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: LocationGenerationOptions,
  ): Promise<LocationAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    let imageContext: ImageGenerationContext;
    try {
      imageContext = captureImageGenerationContext();
    } catch {
      _state.error.value = "No active campaign selected.";
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }
    const campaignId = imageContext.campaignId;

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";

      return isLocalMode
        ? await generateClientSide(userPrompt, options, imageContext)
        : await generateServerSide(userPrompt, options, campaignId, imageContext);
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  async function generateServerSide(
    userPrompt: string,
    options: LocationGenerationOptions | undefined,
    campaignId: string,
    imageContext: ImageGenerationContext,
  ): Promise<LocationAiGenerated | null> {
    const { data, error } = await supabase.functions.invoke("generate-location", {
      body: {
        campaign_id:    campaignId,
        prompt:         userPrompt,
        location_type:  options?.location_type,
        parent_name:    options?.parent_name,
        generate_image: false,
        generate_map:   false,
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    if (options?.generateImage !== false || options?.generateMap) {
      startAiQuotes("image");
    }

    const locationData = data as LocationAiResult;
    return { ...locationData, ...await generateLocationImages(locationData, options, imageContext) };
  }

  async function generateClientSide(
    userPrompt: string,
    options: LocationGenerationOptions | undefined,
    imageContext: ImageGenerationContext,
  ): Promise<LocationAiGenerated | null> {
    const settingPrompt = imageContext.settingPrompt;
    const textProvider = getTextProvider();

    const [basePrompt, rulesetContext] = await Promise.all([
      fetchSystemPrompt("location"),
      fetchRulesetContext(ruleset.value),
    ]);
    if (!basePrompt) throw new Error("Location system prompt not configured.");
    const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
      setting: settingPrompt,
    })}`;

    const constraints: string[] = [];
    if (options?.location_type) constraints.push(`Location Type: ${options.location_type}`);
    if (options?.parent_name) constraints.push(`Parent Location: ${options.parent_name}`);

    const wrappedPrompt = wrapUserInput(userPrompt);
    const userContent = constraints.length
      ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
      : wrappedPrompt;

    const { content, usage: textUsage } = await textProvider.complete(systemContent, userContent);
    const locationData = JSON.parse(content) as LocationAiResult;
    locationData.ai_provenance = buildAiProvenance("location_generation", textUsage.provider, textUsage.model);

    if (options?.generateImage !== false || options?.generateMap) {
      startAiQuotes("image");
    }

    logUsage({ reason: "location_generation", textUsage });
    return { ...locationData, ...await generateLocationImages(locationData, options, imageContext) };
  }

  async function generateLocationImages(
    locationData: LocationAiResult,
    options: LocationGenerationOptions | undefined,
    imageContext: ImageGenerationContext,
  ): Promise<Pick<LocationAiGenerated, "image_url" | "map_url">> {
    if (options?.generateImage !== false || options?.generateMap) startAiQuotes("image");
    const [image_url, map_url] = await Promise.all([
      options?.generateImage === false
        ? Promise.resolve(null)
        : generateImage({ ...imageContext, purpose: "location", subject: locationData.image_prompt }).catch(() => null),
      options?.generateMap
          ? generateImage({
            ...imageContext,
            purpose: "location_map",
            subject: [MAP_BASE_PROMPT, locationData.map_prompt].filter(Boolean).join(" — "),
          }).catch(() => null)
        : Promise.resolve(null),
    ]);
    return { image_url, map_url };
  }

  return { ..._state, generate };
}
