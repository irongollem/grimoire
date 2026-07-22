import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchImageBasePrompt, fetchRulesetContext } from "./systemPrompts";
import { buildSimpleImagePrompt } from "./imagePrompt";
import { useRuleset } from "@/composables/useRuleset";
import type { PuzzleAiResult, PuzzleAiGenerated } from "./types";
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
  label: "Puzzle",
  entityRoute: (id) => `/puzzles/${id}`,
  openPanel: () => {
    useUiStore().puzzleGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface PuzzleGenerationOptions {
  puzzle_type?: string;
  difficulty?: string;
  generateImage?: boolean;
}

export function usePuzzleGeneration() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: PuzzleGenerationOptions,
  ): Promise<PuzzleAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";
    let textUsage: TextUsage | undefined;
    let imgUsage: ImageUsage | undefined;

    try {
      const textProvider = getTextProvider();
      // ── 1. Generate puzzle text ───────────────────────────────────────
      const [basePrompt, imageBasePrompt, rulesetContext] = await Promise.all([
        fetchSystemPrompt("puzzle"),
        fetchImageBasePrompt(),
        fetchRulesetContext(ruleset.value),
      ]);
      if (!basePrompt) throw new Error("Puzzle system prompt not configured.");
      const systemContent = `${basePrompt}${rulesetContext ? `\n\n${rulesetContext}` : ""}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.puzzle_type)
        constraints.push(`Puzzle Type: ${options.puzzle_type}`);
      if (options?.difficulty)
        constraints.push(`Difficulty: ${options.difficulty}`);

      const wrappedPrompt = wrapUserInput(userPrompt);
      const userContent = constraints.length
        ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : wrappedPrompt;

      const { content, usage: _textUsage } = await textProvider.complete(systemContent, userContent);
      textUsage = _textUsage;
      const puzzleData = JSON.parse(content) as PuzzleAiResult;

      // ── 2. Generate room illustration ─────────────────────────────────
      let image_url: string | null = null;

      if (options?.generateImage !== false && auth.user) {
        startAiQuotes("image");
        try {
          const imageProvider = getImageProvider();
          const imagePrompt = buildSimpleImagePrompt({
            base: imageBasePrompt,
            setting: settingPrompt,
            subject: puzzleData.image_prompt,
          });
          const { b64, usage: _imgUsage } = await imageProvider.generate(imagePrompt, "1024x1536");
          imgUsage = _imgUsage;

          if (b64) {
            image_url = await uploadWithVariants({
              bucket: "puzzleImages",
              userId: auth.user.id,
              blob: b64ToBlob(b64),
            });
          }
        } catch {
          // image generation failure is non-fatal for puzzles
        }
      }

      logUsage({ reason: "puzzle_generation", textUsage, imageUsage: imgUsage });
      return { ...puzzleData, image_url };
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
