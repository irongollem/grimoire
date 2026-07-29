import {
  buildCampaignContext,
} from "./utils";
import { fetchSystemPrompt, fetchRulesetContext } from "./systemPrompts";
import { useRuleset } from "@/composables/useRuleset";
import type { PuzzleAiResult, PuzzleAiGenerated } from "./types";
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
import type { TextUsage } from "./providers/types";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";

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
  const { ruleset } = useRuleset();

  async function generate(
    userPrompt: string,
    options?: PuzzleGenerationOptions,
  ): Promise<PuzzleAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    let imageContext: ReturnType<typeof captureImageGenerationContext>;
    try {
      imageContext = captureImageGenerationContext();
    } catch {
      _state.error.value = "No active campaign selected.";
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }
    const settingPrompt = imageContext.settingPrompt;
    let textUsage: TextUsage | undefined;

    try {
      const textProvider = getTextProvider();
      // ── 1. Generate puzzle text ───────────────────────────────────────
      const [basePrompt, rulesetContext] = await Promise.all([
        fetchSystemPrompt("puzzle"),
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

      if (options?.generateImage !== false) {
        startAiQuotes("image");
        try {
          image_url = await generateImage({
            ...imageContext,
            purpose: "puzzle",
            subject: puzzleData.image_prompt,
          });
        } catch {
          // image generation failure is non-fatal for puzzles
        }
      }

      logUsage({ reason: "puzzle_generation", textUsage });
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
