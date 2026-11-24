import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import type { TrapAiResult, TrapAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import {
  captureFailureMessage,
  captureImageGenerationContext,
  generateImage,
  type ImageGenerationContext,
} from "@/ai/useImageGeneration";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Trap",
  entityRoute: (id) => `/traps/${id}`,
  openPanel: () => {
    useGeneratorUiStore().trapGeneratorOpen = true;
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
  const { ensureLikenessAck } = useLikenessGate();

  async function generate(
    userPrompt: string,
    options?: TrapGenerationOptions,
  ): Promise<TrapAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    if (options?.groupPortraitUrl && !(await ensureLikenessAck())) return null;
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
