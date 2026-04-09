import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { NPC_SYSTEM_PROMPT, ALTER_EGO_PROMPT_ADDON, IMAGE_BASE_PROMPT } from "./prompts";
import type { NpcAiResult, NpcAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const IMAGE_URL = "https://api.openai.com/v1/images/generations";
const EDIT_URL  = "https://api.openai.com/v1/images/edits";

function b64ToBlob(b64: string): Blob {
  const chars = atob(b64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes], { type: "image/webp" });
}

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "NPC",
  entityRoute: (id) => `/npcs/${id}`,
  openPanel: () => {
    useUiStore().npcGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert plain text (with optional markdown headings) to a minimal Tiptap JSON string.
 * Lines starting with "# " become level-1, "## " level-2, etc. Everything else is a paragraph.
 * Double newlines separate blocks.
 */
export function toTiptapJson(text: string): string {
  const blocks = text
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((b) => {
      const match = b.match(/^(#+)\s/);
      if (match) {
        const level = match[1].length;

        const newline = b.indexOf("\n");
        if (newline !== -1) {
          // Heading and paragraph were not separated by a blank line — split them
          const headingText = b.slice(level + 1, newline).trim();
          const paraText = b.slice(newline + 1).trim();
          if (paraText) {
            return [
              {
                type: "heading",
                attrs: { level },
                content: [{ type: "text", text: headingText }],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: paraText }],
              },
            ];
          }
          return [
            {
              type: "heading",
              attrs: { level },
              content: [{ type: "text", text: headingText }],
            },
          ];
        }
        return [
          {
            type: "heading",
            attrs: { level },
            content: [{ type: "text", text: b.slice(level + 1).trim() }],
          },
        ];
      }
      return [{ type: "paragraph", content: [{ type: "text", text: b }] }];
    });
  return JSON.stringify({
    type: "doc",
    content: blocks.length ? blocks : [{ type: "paragraph" }],
  });
}

export function useNpcGeneration() {
  const auth = useAuthStore();

  async function generate(
    apiKey: string,
    settingPrompt: string,
    userPrompt: string,
    options?: { generateAlterEgo?: boolean },
  ): Promise<NpcAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      // ── 1. Generate NPC text data ──────────────────────────────────
      let systemContent = settingPrompt
        ? `${NPC_SYSTEM_PROMPT}\n\nCampaign setting context provided by the DM:\n${settingPrompt}`
        : NPC_SYSTEM_PROMPT;
      if (options?.generateAlterEgo) systemContent += ALTER_EGO_PROMPT_ADDON;

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
        throw new Error(
          body?.error?.message ?? `OpenAI error ${chatRes.status}`,
        );
      }

      const chatData = await chatRes.json();
      const npcData = JSON.parse(
        chatData.choices[0].message.content,
      ) as NpcAiResult;

      // ── 2. Generate true portrait ──────────────────────────────────
      startAiQuotes("image");
      const imagePrompt = [
        IMAGE_BASE_PROMPT,
        settingPrompt,
        npcData.image_prompt,
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

      if (!imgRes.ok) {
        const body = await imgRes.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ?? `Image generation error ${imgRes.status}`,
        );
      }

      const imgData = await imgRes.json();
      const b64 = imgData.data?.[0]?.b64_json as string | undefined;

      // ── 3 & 4. Upload true portrait + generate disguise in parallel ──
      let portrait_url: string | null = null;
      let disguise_portrait_url: string | null = null;
      const truePortraitBlob = b64 ? b64ToBlob(b64) : null;

      const uploadTrue = async () => {
        if (!truePortraitBlob || !auth.user) return;
        const path = `${auth.user.id}/${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage
          .from("npc-portraits")
          .upload(path, truePortraitBlob, { contentType: "image/webp" });
        if (!error) {
          portrait_url = supabase.storage.from("npc-portraits").getPublicUrl(path).data.publicUrl;
        }
      };

      const generateDisguise = async () => {
        if (!options?.generateAlterEgo || !npcData.disguise_image_prompt || !truePortraitBlob || !auth.user) return;
        const disguisePrompt = [IMAGE_BASE_PROMPT, settingPrompt, npcData.disguise_image_prompt]
          .filter(Boolean)
          .join(" — ");
        const editForm = new FormData();
        editForm.append("model", "gpt-image-1.5");
        editForm.append("image[]", new File([truePortraitBlob], "portrait.webp", { type: "image/webp" }));
        editForm.append("prompt", disguisePrompt);
        editForm.append("size", "1024x1536");
        editForm.append("output_format", "webp");
        editForm.append("n", "1");
        const editRes = await fetch(EDIT_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: editForm,
        });
        if (!editRes.ok) return; // non-fatal
        const disguiseB64 = (await editRes.json()).data?.[0]?.b64_json as string | undefined;
        if (!disguiseB64) return;
        const disguisePath = `${auth.user.id}/${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage
          .from("npc-portraits")
          .upload(disguisePath, b64ToBlob(disguiseB64), { contentType: "image/webp" });
        if (!error) {
          disguise_portrait_url = supabase.storage.from("npc-portraits").getPublicUrl(disguisePath).data.publicUrl;
        }
      };

      await Promise.all([uploadTrue(), generateDisguise()]);

      return { ...npcData, portrait_url, disguise_portrait_url };
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
