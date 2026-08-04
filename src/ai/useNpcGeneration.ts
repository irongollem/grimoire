import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import type { NpcAiResult, NpcAiGenerated } from "./types";
import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/useRuleset";
import { getTextProvider } from "./providers";
import { wrapUserInput } from "./utils";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { logUsage } from "@/composables/useAiCredits";
import {
  captureImageGenerationContext,
  generateImage,
  type ImageGenerationContext,
} from "@/ai/useImageGeneration";
import { buildAiProvenance } from "@/ai/provenance";
import { useLikenessGate } from "@/composables/useLikenessGate";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "NPC",
  entityRoute: (id) => `/npcs/${id}`,
  openPanel: () => {
    useUiStore().npcGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

// Re-exported for the many generator panels that import it from here;
// the implementation lives in the pure lib module so Node/tsx scripts can
// use it without dragging in supabase/Pinia module side effects.
export { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";

export function useNpcGeneration() {
  const { ruleset } = useRuleset();
  const { ensureLikenessAck } = useLikenessGate();

  async function generate(
    userPrompt: string,
    options?: { generateAlterEgo?: boolean; generateImage?: boolean },
  ): Promise<NpcAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    if (options?.generateAlterEgo && !(await ensureLikenessAck())) return null;
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
        localStorage.getItem("grimoire_key_local_mode") === "local";

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

  // ── Server-side path (key stored encrypted in DB) ──────────────────────────
  // API key is decrypted inside the Edge Function — never sent to the browser.

  async function generateServerSide(
    userPrompt: string,
    options: { generateAlterEgo?: boolean; generateImage?: boolean } | undefined,
    campaignId: string,
    imageContext: ImageGenerationContext,
  ): Promise<NpcAiGenerated | null> {
    const { data, error } = await supabase.functions.invoke("generate-npc", {
      body: {
        campaign_id:        campaignId,
        prompt:             userPrompt,
        generate_alter_ego: options?.generateAlterEgo ?? false,
        // All art goes through the one durable image job pipeline below.
        generate_image:     false,
      },
    });

    if (error) throw new Error(await edgeErrorMessage(error));
    if (data?.error) throw new Error(data.error);

    if (options?.generateImage !== false) {
      startAiQuotes("image");
    }

    const npcData = data as NpcAiResult;
    return { ...npcData, ...await generateNpcImages(npcData, options, imageContext) };
  }

  // ── Client-side path (key kept in localStorage, never leaves the browser) ──
  // Used when the user has opted into local-key mode for privacy.

  async function generateClientSide(
    userPrompt: string,
    options: { generateAlterEgo?: boolean; generateImage?: boolean } | undefined,
    imageContext: ImageGenerationContext,
  ): Promise<NpcAiGenerated | null> {
    const settingPrompt = imageContext.settingPrompt;

    // ── 1. Text generation ─────────────────────────────────────────────────
    const textProvider = getTextProvider();
    const [basePrompt, rulesetContext] = await Promise.all([
      fetchSystemPrompt("npc"),
      fetchRulesetContext(ruleset.value),
    ]);
    if (!basePrompt) throw new Error("NPC system prompt not configured.");
    const systemContent =
      basePrompt +
      (rulesetContext ? `\n\n${rulesetContext}` : "") +
      buildCampaignContext({ setting: settingPrompt });

    const userContent = options?.generateAlterEgo
      ? `${wrapUserInput(userPrompt)}\n\nThis NPC has a disguise identity — populate disguise_name and disguise_image_prompt.`
      : wrapUserInput(userPrompt);

    const { content, usage: textUsage } = await textProvider.complete(systemContent, userContent);
    logUsage({ reason: "npc_generation", textUsage });

    const npcData = JSON.parse(content) as NpcAiResult;
    npcData.ai_provenance = buildAiProvenance("npc_text", textUsage.provider, textUsage.model);

    if (
      options?.generateAlterEgo &&
      (!npcData.disguise_name || !npcData.disguise_image_prompt)
    ) {
      throw new Error("AI response was missing disguise fields — please try again.");
    }

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
      portrait_url = await generateImage({ ...imageContext, purpose: "npc_portrait", subject: npcData.true_portrait_prompt });
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
