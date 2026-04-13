import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { PUZZLE_SYSTEM_PROMPT, IMAGE_BASE_PROMPT, buildCampaignContext } from "./prompts";
import type { PuzzleAiResult, PuzzleAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider, getImageProvider } from "./providers";
import { b64ToBlob } from "./utils";
import { useCampaignStore } from "@/stores/campaign";

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

  async function generate(
    userPrompt: string,
    options?: PuzzleGenerationOptions,
  ): Promise<PuzzleAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";

    try {
      const textProvider = getTextProvider();
      const imageProvider = getImageProvider();
      // ── 1. Generate puzzle text ───────────────────────────────────────
      const systemContent = `${PUZZLE_SYSTEM_PROMPT}${buildCampaignContext({
        setting: settingPrompt,
      })}`;

      const constraints: string[] = [];
      if (options?.puzzle_type) constraints.push(`Puzzle Type: ${options.puzzle_type}`);
      if (options?.difficulty) constraints.push(`Difficulty: ${options.difficulty}`);

      const userContent = constraints.length
        ? `${userPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : userPrompt;

      const puzzleData = JSON.parse(
        await textProvider.complete(systemContent, userContent),
      ) as PuzzleAiResult;

      // ── 2. Generate room illustration ─────────────────────────────────
      let image_url: string | null = null;

      if (options?.generateImage !== false && auth.user) {
        startAiQuotes("image");
        const imagePrompt = [
          IMAGE_BASE_PROMPT,
          settingPrompt,
          puzzleData.image_prompt,
        ]
          .filter(Boolean)
          .join(" — ");

        try {
          const b64 = await imageProvider.generate(imagePrompt, "1024x1536");

          if (b64) {
            const blob = b64ToBlob(b64);
            const path = `${auth.user.id}/${crypto.randomUUID()}.webp`;
            const { error: uploadErr } = await supabase.storage
              .from("puzzle-images")
              .upload(path, blob, { contentType: "image/webp" });
            if (!uploadErr) {
              image_url = supabase.storage
                .from("puzzle-images")
                .getPublicUrl(path).data.publicUrl;
            }
          }
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
