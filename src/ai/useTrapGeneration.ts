import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import {
  buildCampaignContext,
} from "./utils";
import type { TrapAiResult, TrapAiGenerated } from "./types";
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
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/useRuleset";
import {
  captureImageGenerationContext,
  generateImage,
  type ImageGenerationContext,
} from "@/ai/useImageGeneration";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";
// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Trap",
  entityRoute: (id) => `/traps/${id}`,
  openPanel: () => {
    useUiStore().trapGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface TrapGenerationOptions {
  trap_type?: string;
  cr?: string;
  generateImage?: boolean;
  /** When set, passes the party group portrait as a reference image to the OpenAI edit endpoint */
  groupPortraitUrl?: string | null;
}

export function useTrapGeneration() {
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: TrapGenerationOptions,
  ): Promise<TrapAiGenerated | null> {
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
    options: TrapGenerationOptions | undefined,
    campaignId: string,
    imageContext: ImageGenerationContext,
  ): Promise<TrapAiGenerated | null> {
    const { data, error } = await supabase.functions.invoke("generate-trap", {
      body: {
        campaign_id:        campaignId,
        prompt:             userPrompt,
        trap_type:          options?.trap_type,
        cr:                 options?.cr,
        generate_image:     false,
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    if (options?.generateImage !== false) {
      startAiQuotes("image");
    }

    const trapData = data as TrapAiResult;
    return { ...trapData, image_url: await generateTrapImage(trapData, options, imageContext) };
  }

  async function generateClientSide(
    userPrompt: string,
    options: TrapGenerationOptions | undefined,
    imageContext: ImageGenerationContext,
  ): Promise<TrapAiGenerated | null> {
    const settingPrompt = imageContext.settingPrompt;
    const textProvider = getTextProvider();

    const [basePrompt, rulesetContext] = await Promise.all([
      fetchSystemPrompt("trap"),
      fetchRulesetContext(ruleset.value),
    ]);
    if (!basePrompt) throw new Error("Trap system prompt not configured.");

    const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
      setting: settingPrompt,
    })}`;

    const constraints: string[] = [];
    if (options?.trap_type) constraints.push(`Trap Type: ${options.trap_type}`);
    if (options?.cr) constraints.push(`CR: ${options.cr}`);

    const wrappedPrompt = wrapUserInput(userPrompt);
    const userContent = constraints.length
      ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
      : wrappedPrompt;

    const { content, usage: textUsage } = await textProvider.complete(systemContent, userContent);
    const trapData = JSON.parse(content) as TrapAiResult;

    logUsage({ reason: "trap_generation", textUsage });
    return { ...trapData, image_url: await generateTrapImage(trapData, options, imageContext) };
  }

  async function generateTrapImage(
    trapData: TrapAiResult,
    options: TrapGenerationOptions | undefined,
    imageContext: ImageGenerationContext,
  ): Promise<string | null> {
    if (options?.generateImage === false || !trapData.image_prompt) return null;
    startAiQuotes("image");
    const subject = options?.groupPortraitUrl
      ? `${trapData.image_prompt} — The adventuring party from the reference portrait are present, triggering or suffering the trap.`
      : trapData.image_prompt;
    return generateImage({
      ...imageContext,
      purpose: "trap",
      subject,
      referenceUrls: options?.groupPortraitUrl ? [options.groupPortraitUrl] : [],
    }).catch(() => null);
  }

  return { ..._state, generate };
}
