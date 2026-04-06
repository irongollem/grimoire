import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { MONSTER_SYSTEM_PROMPT, IMAGE_BASE_PROMPT } from "./prompts";
import type { MonsterAiResult, MonsterAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const IMAGE_URL = "https://api.openai.com/v1/images/generations";

export interface MonsterGenerationOptions {
  challenge_rating?: string;
  monster_type?: string;
  size?: string;
  generateImage?: boolean;
}

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Monster",
  entityRoute: (id) => `/monsters/${id}`,
  openPanel: () => {
    useUiStore().monsterGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export function useMonsterGeneration() {
  const auth = useAuthStore();

  async function generate(
    apiKey: string,
    settingPrompt: string,
    userPrompt: string,
    options?: MonsterGenerationOptions,
  ): Promise<MonsterAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      // ── 1. Generate stat block text ───────────────────────────────────
      const systemContent = settingPrompt
        ? `${MONSTER_SYSTEM_PROMPT}\n\nCampaign setting context provided by the DM:\n${settingPrompt}`
        : MONSTER_SYSTEM_PROMPT;

      const constraints: string[] = [];
      if (options?.challenge_rating) constraints.push(`Challenge Rating: ${options.challenge_rating}`);
      if (options?.monster_type) constraints.push(`Type: ${options.monster_type}`);
      if (options?.size) constraints.push(`Size: ${options.size}`);

      const fullPrompt = constraints.length
        ? `${userPrompt}\n\n[Constraints — use exactly these values in the stat block: ${constraints.join(", ")}]`
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
            { role: "user", content: fullPrompt },
          ],
        }),
      });

      if (!chatRes.ok) {
        const body = await chatRes.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `OpenAI error ${chatRes.status}`);
      }

      const chatData = await chatRes.json();
      const result = JSON.parse(chatData.choices[0].message.content) as MonsterAiResult;

      // Honour explicit user overrides
      if (options?.challenge_rating) result.stat_block.challenge_rating = options.challenge_rating;
      if (options?.monster_type) result.monster_type = options.monster_type as MonsterAiResult["monster_type"];
      if (options?.size) result.size = options.size as MonsterAiResult["size"];

      // ── 2. Generate art (unless opted out) ───────────────────────────
      const wantImage = options?.generateImage !== false;
      let image_url: string | null = null;

      if (wantImage) {
        startAiQuotes("image");
        const imagePrompt = [IMAGE_BASE_PROMPT, settingPrompt, result.image_prompt]
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

        if (!imgRes.ok) {
          const body = await imgRes.json().catch(() => ({}));
          throw new Error(body?.error?.message ?? `Image generation error ${imgRes.status}`);
        }

        const imgData = await imgRes.json();
        const b64 = imgData.data?.[0]?.b64_json as string | undefined;

        // ── 3. Upload to Supabase storage ─────────────────────────────
        if (b64 && auth.user) {
          const byteChars = atob(b64);
          const bytes = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
          const blob = new Blob([bytes], { type: "image/webp" });
          const path = `${auth.user.id}/${crypto.randomUUID()}.webp`;
          const { error: uploadErr } = await supabase.storage
            .from("asset-images")
            .upload(path, blob, { contentType: "image/webp" });
          if (!uploadErr) {
            image_url = supabase.storage.from("asset-images").getPublicUrl(path).data.publicUrl;
          }
        }
      }

      return { ...result, image_url };
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
