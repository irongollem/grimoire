import { ref } from "vue";
import { textRunsOnLocalKey } from "@/ai/localKeyMode";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { buildCampaignContext, wrapUserInput } from "./utils";
import { getTextProvider } from "./providers";
import { fetchSystemPrompt } from "./systemPrompts";
import { logUsage } from "@/composables/ai/useAiCredits";
import { campaignToday } from "@edge-shared/npcAge";
import { useCampaignStore } from "@/stores/campaign";
import { buildNpcVoiceProfile } from "@/lib/npcs/buildNpcVoiceProfile";
import { buildAiProvenance, type AiProvenance } from "./provenance";
import { formatNpcMemories, loadPromptMemories } from "@edge-shared/npcMemories";
import type { Npc } from "@/types/npc.types";
import { parseVoiceLines } from "./npcVoiceLines";

/** The coach's reply; `lines` is parsed by parseVoiceLines. The provider and model ride along when the caller knows them. */
interface VoiceReply {
  lines?: unknown;
  provider?: string;
  model?: string;
}

/**
 * At-the-table NPC dialogue suggester (#336).
 *
 * Deliberately different from every other generator composable in three ways:
 *
 * 1. NOT registered via `registerAiGenerator()` — this is ephemeral at-table
 *    assistance, not a background entity-creation job. There is no entity to
 *    route to, and nothing for the AI-generation badge to track.
 * 2. NOT gated on `isAnyAiGenerating`, and it never sets that flag. A DM
 *    mid-session may well have a portrait rendering in the background;
 *    blocking the voice coach behind it would defeat the point of the
 *    feature (fast, in-the-moment dialogue).
 * 3. Does NOT call `startAiQuotes()` / `stopAiQuotes()` — those drive the
 *    single global quote carousel, and hijacking it would stomp on the
 *    loading text of a real generation running at the same time. This uses
 *    a plain local `isGenerating` ref instead.
 *
 * Per-instance state (not a module-level singleton): results are scoped to
 * whichever NPC is currently being viewed and must not leak between NPCs.
 */
export function useNpcVoiceCoach() {
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const lines = ref<string[]>([]);
  /** Parallel to `lines`: true where the disguise check says the line may give the disguise away. */
  const reveals = ref<boolean[]>([]);
  /** Which model wrote the current lines; null when the path did not report it. */
  const provenance = ref<AiProvenance | null>(null);

  async function suggest(npc: Npc, situation: string): Promise<void> {
    isGenerating.value = true;
    error.value = null;
    lines.value = [];
    reveals.value = [];
    provenance.value = null;

    if (!npc.campaign_id) {
      error.value = "This NPC has no associated campaign.";
      isGenerating.value = false;
      return;
    }

    try {
      const isLocalMode = await textRunsOnLocalKey();

      const result = isLocalMode
        ? await suggestClientSide(npc, npc.campaign_id, situation)
        : await suggestServerSide(npc, npc.campaign_id, situation);

      const sanitized = parseVoiceLines(result.lines);
      if (sanitized.length === 0) {
        error.value = "AI returned no usable dialogue. Please try again.";
        return;
      }
      lines.value = sanitized.map((l) => l.text);
      reveals.value = sanitized.map((l) => l.reveals);
      if (result.provider && result.model) {
        provenance.value = buildAiProvenance("npc_voice", result.provider, result.model);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Generation failed";
    } finally {
      isGenerating.value = false;
    }
  }

  async function suggestServerSide(
    npc: Npc,
    campaignId: string,
    situation: string,
  ): Promise<VoiceReply> {
    const { data, error: fnError } = await supabase.functions.invoke("generate-npc-voice", {
      body: {
        campaign_id: campaignId,
        npc_id: npc.id,
        situation,
      },
    });

    if (fnError) throw new Error(await edgeErrorMessage(fnError));
    if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
    return data as VoiceReply;
  }

  /** BYOK/local mode: the key never leaves the browser, so no edge call. */
  async function suggestClientSide(npc: Npc, campaignId: string, situation: string): Promise<VoiceReply> {
    const campaign = useCampaignStore();
    const textProvider = getTextProvider();

    const basePrompt = await fetchSystemPrompt("npc_voice");
    if (!basePrompt) throw new Error("NPC voice system prompt not configured.");

    // No fetchRulesetContext here — this is pure dialogue with no rules
    // content, so that context would be dead prompt weight on a call where
    // every extra round-trip is felt at the table. Mirrors the edge function.
    const systemContent = `${basePrompt}${buildCampaignContext({
      setting: campaign.activeCampaign?.ai_setting_prompt,
    })}`;

    // The same newest-memories block the edge function appends, read and
    // formatted by the same shared code, so the two paths cannot disagree.
    const memoryBlock = formatNpcMemories(await loadPromptMemories(supabase, npc.id, campaignId), npc);
    const userContent =
      `${wrapUserInput(situation)}\n\nNPC Profile:\n${buildNpcVoiceProfile(npc, campaignToday(campaign.activeCampaign))}` +
      (memoryBlock ? `\n\n${memoryBlock}` : "");

    const { content, usage: textUsage } = await textProvider.complete(systemContent, userContent);

    // A fenced or truncated response would otherwise surface a raw
    // SyntaxError ("Unexpected token ... in JSON") to the DM mid-session.
    // The edge function guards its own parse identically.
    let parsed: VoiceReply;
    try {
      parsed = JSON.parse(content) as VoiceReply;
    } catch {
      throw new Error("AI returned malformed dialogue. Please try again.");
    }

    logUsage({ reason: "npc_voice_generation", textUsage });
    return { ...parsed, provider: textUsage.provider, model: textUsage.model };
  }

  function clear(): void {
    error.value = null;
    lines.value = [];
    reveals.value = [];
    provenance.value = null;
  }

  return { isGenerating, error, lines, reveals, provenance, suggest, clear };
}
