import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import { NPC_SYSTEM_PROMPT, IMAGE_BASE_PROMPT, buildCampaignContext, INJECTION_GUARD_SUFFIX } from "./prompts";
import type { NpcAiResult, NpcAiGenerated } from "./types";
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
 * Lines starting with "# " become level-1, "## " level-2, etc.
 * Everything else is a paragraph. Double newlines separate blocks.
 * (AI generators don't emit markdown tables; use markdownToTiptapJson for that.)
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
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options?: { generateAlterEgo?: boolean; generateImage?: boolean },
  ): Promise<NpcAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";

    try {
      const textProvider = getTextProvider();
      const imageProvider = getImageProvider();

      // ── 1. Generate NPC text data ──────────────────────────────────
      const systemContent = `${NPC_SYSTEM_PROMPT}${buildCampaignContext({
        setting: settingPrompt,
      })}${INJECTION_GUARD_SUFFIX}`;

      const wrappedPrompt = wrapUserInput(userPrompt);
      const fullPrompt = options?.generateAlterEgo
        ? `${wrappedPrompt}\n\nThis NPC has a disguise identity — populate disguise_name and disguise_image_prompt.`
        : wrappedPrompt;

      const npcData = JSON.parse(
        await textProvider.complete(systemContent, fullPrompt),
      ) as NpcAiResult;

      if (options?.generateAlterEgo && (!npcData.disguise_name || !npcData.disguise_image_prompt)) {
        throw new Error("AI response was missing disguise fields — please try again.");
      }

      // ── 2–4. Image generation (skipped when generateImage === false) ──
      let portrait_url: string | null = null;
      let disguise_portrait_url: string | null = null;

      if (options?.generateImage !== false) {
        if (!npcData.true_portrait_prompt) {
          throw new Error("AI response missing portrait description (true_portrait_prompt)");
        }
        startAiQuotes("image");
        const imagePrompt = [
          `Style: ${IMAGE_BASE_PROMPT}`,
          settingPrompt ? `Setting: ${settingPrompt}` : null,
          `Subject: ${npcData.true_portrait_prompt}`,
        ]
          .filter(Boolean)
          .join("\n");

        const b64 = await imageProvider.generate(imagePrompt, "1024x1536");
        const truePortraitBlob = b64 ? b64ToBlob(b64) : null;

        const uploadTrue = async () => {
          if (!truePortraitBlob || !auth.user) return;
          portrait_url = await uploadWithVariants({ bucket: "npcPortraits", userId: auth.user.id, blob: truePortraitBlob });
        };

        const generateDisguise = async () => {
          if (
            !options?.generateAlterEgo ||
            !npcData.disguise_image_prompt ||
            !truePortraitBlob ||
            !auth.user ||
            !imageProvider.edit
          )
            return;
          const disguisePrompt = [
            IMAGE_BASE_PROMPT,
            settingPrompt,
            npcData.disguise_image_prompt,
          ]
            .filter(Boolean)
            .join(" — ");
          try {
            const disguiseB64 = await imageProvider.edit(
              truePortraitBlob,
              disguisePrompt,
              "1024x1536",
            );
            if (!disguiseB64 || !auth.user) return;
            disguise_portrait_url = await uploadWithVariants({ bucket: "npcPortraits", userId: auth.user.id, blob: b64ToBlob(disguiseB64) });
          } catch {
            // non-fatal — disguise generation failure does not block NPC save
          }
        };

        await Promise.all([uploadTrue(), generateDisguise()]);
      }

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
