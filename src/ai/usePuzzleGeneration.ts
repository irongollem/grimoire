import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { PUZZLE_SYSTEM_PROMPT, IMAGE_BASE_PROMPT } from "./prompts";
import type { PuzzleAiResult, PuzzleAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const IMAGE_URL = "https://api.openai.com/v1/images/generations";

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

  async function generate(
    apiKey: string,
    settingPrompt: string,
    userPrompt: string,
    options?: PuzzleGenerationOptions,
  ): Promise<PuzzleAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      // ── 1. Generate puzzle text ───────────────────────────────────────
      const systemContent = settingPrompt
        ? `${PUZZLE_SYSTEM_PROMPT}\n\nCampaign setting context provided by the DM:\n${settingPrompt}`
        : PUZZLE_SYSTEM_PROMPT;

      const constraints: string[] = [];
      if (options?.puzzle_type) constraints.push(`Puzzle Type: ${options.puzzle_type}`);
      if (options?.difficulty) constraints.push(`Difficulty: ${options.difficulty}`);

      const userContent = constraints.length
        ? `${userPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : userPrompt;

      const chatRes = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: userContent },
          ],
        }),
      });

      if (!chatRes.ok) {
        const body = await chatRes.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `OpenAI error ${chatRes.status}`);
      }

      const chatData = await chatRes.json();
      const puzzleData = JSON.parse(chatData.choices[0].message.content) as PuzzleAiResult;

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

        const imgRes = await fetch(IMAGE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1.5",
            prompt: imagePrompt,
            size: "1024x1536",
            output_format: "webp",
          }),
        });

        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const b64 = imgData.data?.[0]?.b64_json as string | undefined;

          if (b64) {
            const byteChars = atob(b64);
            const bytes = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++)
              bytes[i] = byteChars.charCodeAt(i);
            const blob = new Blob([bytes], { type: "image/webp" });
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
