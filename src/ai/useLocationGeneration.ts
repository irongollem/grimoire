import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchImageBasePrompt, fetchRulesetContext } from "./systemPrompts";
import { buildSimpleImagePrompt } from "./imagePrompt";
import { useRuleset } from "@/composables/useRuleset";
import type { LocationAiResult, LocationAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider, getImageProvider, OPENAI_IMAGE_MODEL_KEY } from "./providers";
import { b64ToBlob, wrapUserInput } from "./utils";
import { useCampaignStore } from "@/stores/campaign";
import { logUsage } from "@/composables/useAiCredits";
import type { ImageUsage } from "./providers/types";

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
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: LocationGenerationOptions,
  ): Promise<LocationAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const campaignId = campaign.activeCampaign?.id;
    if (!campaignId) {
      _state.error.value = "No active campaign selected.";
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";

      return isLocalMode
        ? await generateClientSide(userPrompt, options)
        : await generateServerSide(userPrompt, options, campaignId);
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
  ): Promise<LocationAiGenerated | null> {
    const imageModel =
      (typeof localStorage !== "undefined" ? localStorage.getItem(OPENAI_IMAGE_MODEL_KEY) : null) ??
      "gpt-image-2";

    const { data, error } = await supabase.functions.invoke("generate-location", {
      body: {
        campaign_id:    campaignId,
        prompt:         userPrompt,
        location_type:  options?.location_type,
        parent_name:    options?.parent_name,
        generate_image: options?.generateImage !== false,
        generate_map:   options?.generateMap === true,
        image_model:    imageModel,
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    if (options?.generateImage !== false || options?.generateMap) {
      startAiQuotes("image");
    }

    const { image_b64, map_b64, ...locationData } = data as { image_b64: string | null; map_b64: string | null } & LocationAiResult;

    const [image_url, map_url] = await Promise.all([
      image_b64 && auth.user
        ? uploadWithVariants({ bucket: "locationImages", userId: auth.user.id, blob: b64ToBlob(image_b64) })
        : Promise.resolve(null),
      map_b64 && auth.user
        ? uploadWithVariants({ bucket: "locationImages", userId: auth.user.id, blob: b64ToBlob(map_b64) })
        : Promise.resolve(null),
    ]);

    return { ...locationData, image_url, map_url };
  }

  async function generateClientSide(
    userPrompt: string,
    options: LocationGenerationOptions | undefined,
  ): Promise<LocationAiGenerated | null> {
    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";
    let totalImageCount = 0;
    let lastImgUsage: ImageUsage | undefined;

    const textProvider = getTextProvider();
    const imageProvider = getImageProvider();

    const [basePrompt, imageBasePrompt, rulesetContext] = await Promise.all([
      fetchSystemPrompt("location"),
      fetchImageBasePrompt(),
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

    if (options?.generateImage !== false || options?.generateMap) {
      startAiQuotes("image");
    }

    const [image_url, map_url] = await Promise.all([
      (async (): Promise<string | null> => {
        if (options?.generateImage === false || !auth.user) return null;
        try {
          const imagePrompt = buildSimpleImagePrompt({
            base: imageBasePrompt,
            setting: settingPrompt,
            subject: locationData.image_prompt,
          });
          const { b64, usage } = await imageProvider.generate(imagePrompt, "1024x1024");
          lastImgUsage = usage;
          totalImageCount++;
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
          const { b64, usage } = await imageProvider.generate(mapPrompt, "1024x1024");
          lastImgUsage = usage;
          totalImageCount++;
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

    const imgUsage: ImageUsage | undefined = lastImgUsage
      ? { ...lastImgUsage, image_count: totalImageCount }
      : undefined;
    logUsage({ reason: "location_generation", textUsage, imageUsage: imgUsage });
    return { ...locationData, image_url, map_url };
  }

  return { ..._state, generate };
}
