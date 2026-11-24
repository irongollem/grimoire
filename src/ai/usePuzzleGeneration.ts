import { generateEntityText } from "./entityTextGeneration";
import type { PuzzleAiResult, PuzzleAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useAskUiStore } from "@/stores/ui/ask";
import { captureFailureMessage, captureImageGenerationContext, generateImage } from "./useImageGeneration";

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Puzzle",
  entityRoute: (id) => `/puzzles/${id}`,
  // The generator is a card in the Familiar now: the badge brings the DM back to it.
  openPanel: () => {
    useAskUiStore().openPanel();
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface PuzzleGenerationOptions {
  puzzle_type?: string;
  difficulty?: string;
  generateImage?: boolean;
}

export function usePuzzleGeneration() {

  async function generate(
    userPrompt: string,
    options?: PuzzleGenerationOptions,
  ): Promise<PuzzleAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    let imageContext: Awaited<ReturnType<typeof captureImageGenerationContext>>;
    try {
      imageContext = await captureImageGenerationContext();
    } catch (e) {
      _state.error.value = captureFailureMessage(e);
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
