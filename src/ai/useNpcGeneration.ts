import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { NPC_CONTEXT_LIMIT } from "@edge-shared/npcPrompt.ts";
import type { NpcAiResult, NpcAiGenerated } from "./types";
import { AI_PROMPT_LIMIT } from "./utils";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useNpcsUiStore } from "@/stores/ui/npcs";
import {
  captureFailureMessage,
  captureImageGenerationContext,
  generateImage,
  type ImageGenerationContext,
} from "@/ai/useImageGeneration";
import { reportHandledError } from "@/lib/observability/sentry";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";
import { useCampaignStore } from "@/stores/campaign";
import { npcPortraitSubject, speciesPictureFor } from "@/lib/npcGenerator/portraitSubject";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "NPC",
  entityRoute: (id) => `/npcs/${id}`,
  openPanel: () => {
    useNpcsUiStore().npcGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

// Re-exported for the many generator panels that import it from here;
// the implementation lives in the pure lib module so Node/tsx scripts can
// use it without dragging in supabase/Pinia module side effects.
export { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";

interface NpcGenerationOptions {
  generateAlterEgo?: boolean;
  generateImage?: boolean;
  context?: string;
}

/** The picture of the NPC's species in this campaign or the library, or null; only species with a picture are read. */
async function speciesPicture(campaignId: string, race: string | null | undefined): Promise<string | null> {
  if (typeof race !== "string" || race.trim() === "") return null;
  const [own, library] = await Promise.all([
    supabase.from("species").select("name, image_url").eq("campaign_id", campaignId).not("image_url", "is", null),
    supabase.from("library_species").select("name, image_url").not("image_url", "is", null),
  ]);
  if (own.error) throw own.error;
  if (library.error) throw library.error;
  return speciesPictureFor(race, own.data, library.data);
}

export function useNpcGeneration() {
  const { ensureLikenessAck } = useLikenessGate();

  async function generate(
    userPrompt: string,
    options?: NpcGenerationOptions,
  ): Promise<NpcAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    const prompt = userPrompt.trim();
    if (prompt.length > AI_PROMPT_LIMIT) {
      _state.error.value = `Shorten the concept to ${AI_PROMPT_LIMIT} characters and try again.`;
      return null;
    }
    const campaign = useCampaignStore();
    const campaignAtStart = campaign.activeCampaignId;
    const generationOptions = { ...options, context: options?.context?.trim().slice(0, NPC_CONTEXT_LIMIT) };
    if (options?.generateAlterEgo && !(await ensureLikenessAck())) return null;
    if (campaign.activeCampaignId !== campaignAtStart) {
      _state.error.value = "The active campaign changed. Reopen the generator and try again.";
      return null;
    }
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
    if (campaign.activeCampaignId !== campaignAtStart || imageContext.campaignId !== campaignAtStart) {
      _state.error.value = "The active campaign changed. Reopen the generator and try again.";
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }
    const campaignId = imageContext.campaignId;

    try {
      return await generateServerSide(prompt, generationOptions, campaignId, imageContext);
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  // The text call runs in the edge function and is paid in credits.

  async function generateServerSide(
    userPrompt: string,
    options: NpcGenerationOptions | undefined,
    campaignId: string,
    imageContext: ImageGenerationContext,
  ): Promise<NpcAiGenerated | null> {
    const { data, error } = await supabase.functions.invoke("generate-npc", {
      body: {
        campaign_id:        campaignId,
        prompt:             userPrompt,
        context:            options?.context,
        generate_alter_ego: options?.generateAlterEgo ?? false,
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    if (options?.generateImage !== false) {
      startAiQuotes("image");
    }

    const npcData = normalizeNpcVoice(data as NpcAiResult);
    return { ...npcData, ...await generateNpcImages(npcData, options, imageContext) };
  }

  async function generateNpcImages(
    npcData: NpcAiResult,
    options: { generateAlterEgo?: boolean; generateImage?: boolean } | undefined,
    imageContext: ImageGenerationContext,
  ): Promise<Pick<NpcAiGenerated, "portrait_url" | "disguise_portrait_url">> {
    let portrait_url: string | null = null;
    let disguise_portrait_url: string | null = null;
    if (options?.generateImage === false || !npcData.true_portrait_prompt) {
      return { portrait_url, disguise_portrait_url };
    }
    startAiQuotes("image");
    try {
      // The species leads, so the picture cannot paint a human where the record says halfling, and its own picture goes
      // along when it has one: not every species is known to an image model, and no homebrew one is.
      // An optional reference that fails to load paints without it: the portrait is already paid for.
      let reference: string | null = null;
      try {
        reference = await speciesPicture(imageContext.campaignId, npcData.race);
      } catch (e) {
        reportHandledError(e, "npc-species-reference");
      }
      portrait_url = await generateImage({
        ...imageContext,
        purpose: "npc_portrait",
        subject: npcPortraitSubject(npcData.race, npcData.true_portrait_prompt, reference !== null),
        ...(reference ? { referenceUrls: [reference] } : {}),
      });
    } catch { /* art is non-fatal */ }
    if (options?.generateAlterEgo && portrait_url && npcData.disguise_image_prompt) {
      try {
        disguise_portrait_url = await generateImage({
          ...imageContext,
          purpose: "npc_disguise",
          subject: npcData.disguise_image_prompt,
          referenceUrls: [portrait_url],
        });
      } catch { /* disguise art is non-fatal */ }
    }
    return { portrait_url, disguise_portrait_url };
  }

  return { ..._state, generate };
}

function normalizeNpcVoice(data: NpcAiResult): NpcAiResult {
  return { ...data, voice: typeof data.voice === "string" ? data.voice : "" };
}
