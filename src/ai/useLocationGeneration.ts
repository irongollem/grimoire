import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { LocationAiResult, LocationAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import {
  captureFailureMessage,
  captureImageGenerationContext,
  generateImage,
  type ImageGenerationContext,
} from "@/ai/useImageGeneration";
import { placeRoute } from "@/lib/locations/placeRoute";


const MAP_BASE_PROMPT =
  "Top-down fantasy cartography map. Hand-drawn ink style, bird's-eye view, clean linework, labeled zones, hatching for walls and elevation, minimal colour. Readable as a functional map, not a painting.";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Location",
  entityRoute: (id) => placeRoute(id),
  // The generator is a card in the Familiar now: the badge brings the DM back to it.
});

// ────────────────────────────────────────────────────────────────────────────

export interface LocationGenerationOptions {
  location_type?: string;
  parent_name?: string;
  generateImage?: boolean;
  generateMap?: boolean;
}

export function useLocationGeneration() {

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
      imageContext = await captureImageGenerationContext();
    } catch (e) {
      _state.error.value = captureFailureMessage(e);
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }
    const campaignId = imageContext.campaignId;

    try {
      return await generateServerSide(userPrompt, options, campaignId, imageContext);
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
