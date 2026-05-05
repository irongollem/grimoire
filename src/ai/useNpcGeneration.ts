import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { NpcAiResult, NpcAiGenerated } from "./types";
import {
  NPC_SYSTEM_PROMPT,
  IMAGE_BASE_PROMPT,
  buildCampaignContext,
  INJECTION_GUARD_SUFFIX,
} from "./prompts";
import { getTextProvider, getImageProvider } from "./providers";
import { b64ToBlob, wrapUserInput } from "./utils";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { logUsage } from "@/composables/useAiCredits";
import { OPENAI_IMAGE_MODEL_KEY } from "./providers";

interface GenerateNpcResponse extends NpcAiResult {
  portrait_b64: string | null;
  disguise_portrait_b64: string | null;
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

    const campaignId = campaign.activeCampaign?.id;
    if (!campaignId) {
      _state.error.value = "No active campaign selected.";
      _state.isGenerating.value = false;
      stopAiQuotes();
      return null;
    }

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem("grimoire_key_local_mode") === "local";

      return isLocalMode
        ? await generateClientSide(userPrompt, options)
        : await generateServerSide(userPrompt, options, campaignId);
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  // ── Server-side path (key stored encrypted in DB) ──────────────────────────
  // API key is decrypted inside the Edge Function — never sent to the browser.

  async function generateServerSide(
    userPrompt: string,
    options: { generateAlterEgo?: boolean; generateImage?: boolean } | undefined,
    campaignId: string,
  ): Promise<NpcAiGenerated | null> {
    const imageModel =
      (typeof localStorage !== "undefined" ? localStorage.getItem(OPENAI_IMAGE_MODEL_KEY) : null) ??
      "gpt-image-2";

    const { data, error } = await supabase.functions.invoke("generate-npc", {
      body: {
        campaign_id:        campaignId,
        prompt:             userPrompt,
        generate_alter_ego: options?.generateAlterEgo ?? false,
        generate_image:     options?.generateImage !== false,
        image_model:        imageModel,
      },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    if (options?.generateImage !== false) {
      startAiQuotes("image");
    }

    const { portrait_b64, disguise_portrait_b64, ...npcFields } = data as GenerateNpcResponse;

    const [portrait_url, disguise_portrait_url] = await Promise.all([
      portrait_b64 && auth.user
        ? uploadWithVariants({ bucket: "npcPortraits", userId: auth.user.id, blob: b64ToBlob(portrait_b64) })
        : Promise.resolve(null),
      disguise_portrait_b64 && auth.user
        ? uploadWithVariants({ bucket: "npcPortraits", userId: auth.user.id, blob: b64ToBlob(disguise_portrait_b64) })
        : Promise.resolve(null),
    ]);

    return { ...npcFields, portrait_url, disguise_portrait_url };
  }

  // ── Client-side path (key kept in localStorage, never leaves the browser) ──
  // Used when the user has opted into local-key mode for privacy.

  async function generateClientSide(
    userPrompt: string,
    options: { generateAlterEgo?: boolean; generateImage?: boolean } | undefined,
  ): Promise<NpcAiGenerated | null> {
    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";

    // ── 1. Text generation ─────────────────────────────────────────────────
    const textProvider = getTextProvider();
    const systemContent =
      NPC_SYSTEM_PROMPT +
      buildCampaignContext({ setting: settingPrompt }) +
      INJECTION_GUARD_SUFFIX;

    const userContent = options?.generateAlterEgo
      ? `${wrapUserInput(userPrompt)}\n\nThis NPC has a disguise identity — populate disguise_name and disguise_image_prompt.`
      : wrapUserInput(userPrompt);

    const { content, usage: textUsage } = await textProvider.complete(systemContent, userContent);
    logUsage({ reason: "npc_generation", textUsage });

    const npcData = JSON.parse(content) as NpcAiResult;

    if (
      options?.generateAlterEgo &&
      (!npcData.disguise_name || !npcData.disguise_image_prompt)
    ) {
      throw new Error("AI response was missing disguise fields — please try again.");
    }

    // ── 2. Image generation ────────────────────────────────────────────────
    let portrait_url: string | null = null;
    let disguise_portrait_url: string | null = null;

    if (options?.generateImage !== false && npcData.true_portrait_prompt && auth.user) {
      startAiQuotes("image");

      const imageProvider = getImageProvider();
      const imagePrompt = [
        `Style: ${IMAGE_BASE_PROMPT}`,
        settingPrompt ? `Setting: ${settingPrompt}` : null,
        `Subject: ${npcData.true_portrait_prompt}`,
      ]
        .filter(Boolean)
        .join("\n");

      let portraitB64: string | null = null;
      try {
        const { b64, usage: imgUsage } = await imageProvider.generate(imagePrompt, "1024x1536");
        portraitB64 = b64;
        logUsage({ reason: "npc_portrait", imageUsage: imgUsage });
        portrait_url = await uploadWithVariants({
          bucket: "npcPortraits",
          userId: auth.user.id,
          blob: b64ToBlob(b64),
        });
      } catch {
        // non-fatal — continue without portrait
      }

      if (
        options?.generateAlterEgo &&
        portraitB64 &&
        npcData.disguise_image_prompt &&
        imageProvider.edit &&
        auth.user
      ) {
        const disguisePrompt = [IMAGE_BASE_PROMPT, settingPrompt, npcData.disguise_image_prompt]
          .filter(Boolean)
          .join(" — ");
        try {
          const { b64: disguiseB64, usage: disguiseUsage } = await imageProvider.edit(
            b64ToBlob(portraitB64),
            disguisePrompt,
            "1024x1536",
          );
          logUsage({ reason: "npc_disguise_portrait", imageUsage: disguiseUsage });
          disguise_portrait_url = await uploadWithVariants({
            bucket: "npcPortraits",
            userId: auth.user.id,
            blob: b64ToBlob(disguiseB64),
          });
        } catch {
          // non-fatal — continue without disguise portrait
        }
      }
    }

    return { ...npcData, portrait_url, disguise_portrait_url };
  }

  return { ..._state, generate };
}
