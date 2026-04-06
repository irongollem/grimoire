import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { ITEM_SYSTEM_PROMPT, IMAGE_BASE_PROMPT } from "./prompts";
import type { ItemAiResult, ItemAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const IMAGE_URL = "https://api.openai.com/v1/images/generations";

export interface ItemGenerationOptions {
  item_type?: string;
  rarity?: string;
  cursed?: boolean;
  generateImage?: boolean;
}

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Item",
  entityRoute: (id) => `/vault/${id}`,
  openPanel: () => {
    useUiStore().itemGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export function useItemGeneration() {
  const auth = useAuthStore();

  async function generate(
    apiKey: string,
    settingPrompt: string,
    userPrompt: string,
    options?: ItemGenerationOptions,
  ): Promise<ItemAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      // ── 1. Generate item text ─────────────────────────────────────────────
      const systemContent = settingPrompt
        ? `${ITEM_SYSTEM_PROMPT}\n\nCampaign setting context provided by the DM:\n${settingPrompt}`
        : ITEM_SYSTEM_PROMPT;

      const constraints: string[] = [];
      if (options?.item_type) constraints.push(`Item Type: ${options.item_type}`);
      if (options?.rarity) constraints.push(`Rarity: ${options.rarity}`);
      if (options?.cursed) constraints.push(`This item must be cursed — populate curse_description with the curse effect, trigger, and removal method`);

      const fullPrompt = constraints.length
        ? `${userPrompt}\n\n[Constraints — use exactly these values: ${constraints.join(", ")}]`
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
      const result = JSON.parse(chatData.choices[0].message.content) as ItemAiResult;

      // Merge game_benefits into description as a separate paragraph
      if (result.game_benefits) {
        result.description = `${result.description}\n\n${result.game_benefits}`;
      }

      // Honour explicit user overrides
      if (options?.item_type) result.item_type = options.item_type as ItemAiResult["item_type"];
      if (options?.rarity) result.rarity = options.rarity as ItemAiResult["rarity"];

      // ── 2. Generate art (unless opted out) ───────────────────────────────
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

        // ── 3. Upload to Supabase storage ─────────────────────────────────
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
