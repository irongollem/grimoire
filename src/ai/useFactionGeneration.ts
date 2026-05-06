import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchImageBasePrompt } from "./systemPrompts";
import type { FactionAiResult, FactionAiGenerated } from "./types";
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
import { logUsage } from "@/composables/useAiCredits";
import type { TextUsage, ImageUsage } from "./providers/types";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Faction",
  entityRoute: (id) => `/factions/${id}`,
  openPanel: () => {
    useUiStore().factionGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface FactionGenerationOptions {
  faction_type?: string;
  alignment?: string;
  generateImage?: boolean;
  leader_name?: string;
  headquarters_name?: string;
}

export function useFactionGeneration() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options?: FactionGenerationOptions,
  ): Promise<FactionAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";
    let textUsage: TextUsage | undefined;
    let imgUsage: ImageUsage | undefined;

    try {
      const textProvider = getTextProvider();

      const [basePrompt, imageBasePrompt] = await Promise.all([
        fetchSystemPrompt("faction"),
        fetchImageBasePrompt(),
      ]);
      if (!basePrompt) throw new Error("Faction system prompt not configured.");
      const systemContent = `${basePrompt}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.faction_type)      constraints.push(`Faction Type: ${options.faction_type}`);
      if (options?.alignment)         constraints.push(`Alignment: ${options.alignment}`);
      if (options?.leader_name)       constraints.push(`Leader: ${options.leader_name}`);
      if (options?.headquarters_name) constraints.push(`Headquarters: ${options.headquarters_name}`);

      const wrappedPrompt = wrapUserInput(userPrompt);
      const userContent = constraints.length
        ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : wrappedPrompt;

      const { content, usage: _textUsage } = await textProvider.complete(systemContent, userContent);
      textUsage = _textUsage;
      const factionData = JSON.parse(content) as FactionAiResult;

      // ── Emblem ─────────────────────────────────────────────────────────────
      let image_url: string | null = null;
      if (options?.generateImage !== false) {
        startAiQuotes("image");
        try {
          const imagePrompt = [imageBasePrompt, settingPrompt, factionData.image_prompt]
            .filter(Boolean)
            .join(" — ");
          const imageProvider = getImageProvider();
          const { b64, usage: _imgUsage } = await imageProvider.generate(imagePrompt, "1024x1024");
          imgUsage = _imgUsage;
          if (b64 && auth.user) {
            image_url = await uploadWithVariants({
              bucket: "factionImages",
              userId: auth.user.id,
              blob: b64ToBlob(b64),
            });
          }
        } catch {
          // non-fatal
        }
      }

      logUsage({ reason: "faction_generation", textUsage, imageUsage: imgUsage });
      return { ...factionData, image_url };
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
