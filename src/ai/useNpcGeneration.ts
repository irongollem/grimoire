import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { NPC_SYSTEM_PROMPT, IMAGE_BASE_PROMPT } from "./prompts";
import type { NpcAiResult, NpcAiGenerated } from "./types";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const IMAGE_URL = "https://api.openai.com/v1/images/generations";

/** Convert plain paragraphs (double-newline separated) to a minimal Tiptap JSON string. */
export function toTiptapJson(text: string): string {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }));
  return JSON.stringify({
    type: "doc",
    content: paragraphs.length ? paragraphs : [{ type: "paragraph" }],
  });
}

export function useNpcGeneration() {
  const auth = useAuthStore();
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  /** Rough phase indicator for status messaging in the dialog. */
  const phase = ref<"idle" | "text" | "image" | "upload">("idle");

  async function generate(
    apiKey: string,
    settingPrompt: string,
    userPrompt: string,
  ): Promise<NpcAiGenerated | null> {
    isGenerating.value = true;
    error.value = null;

    try {
      // ── 1. Generate NPC text data ──────────────────────────────────
      phase.value = "text";

      const systemContent = settingPrompt
        ? `${NPC_SYSTEM_PROMPT}\n\nCampaign setting context provided by the DM:\n${settingPrompt}`
        : NPC_SYSTEM_PROMPT;

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
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!chatRes.ok) {
        const body = await chatRes.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `OpenAI error ${chatRes.status}`);
      }

      const chatData = await chatRes.json();
      const npcData = JSON.parse(chatData.choices[0].message.content) as NpcAiResult;

      // ── 2. Generate portrait ───────────────────────────────────────
      phase.value = "image";

      const imagePrompt = [IMAGE_BASE_PROMPT, settingPrompt, npcData.image_prompt]
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
          size: "1024x1024",
          output_format: "b64_json",
        }),
      });

      if (!imgRes.ok) {
        const body = await imgRes.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Image generation error ${imgRes.status}`);
      }

      const imgData = await imgRes.json();
      const b64 = imgData.data?.[0]?.b64_json as string | undefined;

      // ── 3. Upload portrait to Supabase storage ─────────────────────
      phase.value = "upload";
      let portrait_url: string | null = null;

      if (b64 && auth.user) {
        const byteChars = atob(b64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });
        const path = `${auth.user.id}/${crypto.randomUUID()}.png`;
        const { error: uploadErr } = await supabase.storage
          .from("npc-portraits")
          .upload(path, blob, { contentType: "image/png" });
        if (!uploadErr) {
          portrait_url = supabase.storage.from("npc-portraits").getPublicUrl(path).data.publicUrl;
        }
      }

      return { ...npcData, portrait_url };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      isGenerating.value = false;
      phase.value = "idle";
    }
  }

  return { isGenerating, error, phase, generate };
}
