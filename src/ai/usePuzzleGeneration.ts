import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import type { PuzzleAiResult, PuzzleAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { usePuzzlesUiStore } from "@/stores/ui/puzzles";
import { captureImageGenerationContext, generateImage } from "./useImageGeneration";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Puzzle",
  entityRoute: (id) => `/puzzles/${id}`,
  openPanel: () => {
    usePuzzlesUiStore().puzzleGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface PuzzleGenerationOptions {
  puzzle_type?: string;
  difficulty?: string;
  generateImage?: boolean;
}

export function usePuzzleGeneration() {
  const { ruleset } = useTableRuleset();

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

    try {
      const constraints: string[] = [];
      if (options?.puzzle_type)
        constraints.push(`Puzzle Type: ${options.puzzle_type}`);
      if (options?.difficulty)
        constraints.push(`Difficulty: ${options.difficulty}`);

      // ── 1. Generate puzzle text ───────────────────────────────────────
      const puzzleData = await generateEntityText<PuzzleAiResult>({
        generator: "puzzle",
        campaignId: imageContext.campaignId,
        settingPrompt: imageContext.settingPrompt,
        ruleset: ruleset.value,
        prompt: userPrompt,
        constraints,
      });

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
