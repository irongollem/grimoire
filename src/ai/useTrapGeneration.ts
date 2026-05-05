import { useAuthStore } from "@/stores/auth";
import { uploadWithVariants } from "@/lib/storage";
import {
  TRAP_SYSTEM_PROMPT,
  IMAGE_BASE_PROMPT,
  buildCampaignContext,
  INJECTION_GUARD_SUFFIX,
} from "./prompts";
import type { TrapAiResult, TrapAiGenerated } from "./types";
import {
  createAiGenerationState,
  startAiQuotes,
  stopAiQuotes,
} from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { useUiStore } from "@/stores/ui";
import { getTextProvider, getImageProvider, OPENAI_IMAGE_MODEL_KEY } from "./providers";
import { b64ToBlob, wrapUserInput } from "./utils";
import { useCampaignStore } from "@/stores/campaign";
import { logUsage } from "@/composables/useAiCredits";
import type { TextUsage, ImageUsage } from "./providers/types";

const OPENAI_EDIT_URL = "https://api.openai.com/v1/images/edits";

async function generateWithPartyReference(
  imagePrompt: string,
  groupPortraitUrl: string,
  openAiKey: string,
): Promise<string | null> {
  const portraitBlob = await fetch(groupPortraitUrl)
    .then((r) => (r.ok ? r.blob() : null))
    .catch(() => null);
  if (!portraitBlob) return null;

  const model =
    (typeof localStorage !== "undefined"
      ? localStorage.getItem(OPENAI_IMAGE_MODEL_KEY)
      : null) ?? "gpt-image-2";

  const prompt = [
    IMAGE_BASE_PROMPT,
    imagePrompt,
    "The adventuring party from the reference portrait are present in this scene — they are the ones triggering or suffering the trap.",
  ].join(" — ");

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", "1024x1536");
  form.append("output_format", "webp");
  form.append("n", "1");
  form.append("image[]", new File([portraitBlob], "party.webp", { type: "image/webp" }));

  const res = await fetch(OPENAI_EDIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}` },
    body: form,
  });
  if (!res.ok) return null;
  return ((await res.json()) as { data: { b64_json: string }[] }).data[0].b64_json;
}

// ── Module-level singleton state ────────────────────────────────────────────
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Trap",
  entityRoute: (id) => `/traps/${id}`,
  openPanel: () => {
    useUiStore().trapGeneratorOpen = true;
  },
});

// ────────────────────────────────────────────────────────────────────────────

export interface TrapGenerationOptions {
  trap_type?: string;
  cr?: string;
  generateImage?: boolean;
  /** When set, passes the party group portrait as a reference image to the OpenAI edit endpoint */
  groupPortraitUrl?: string | null;
}

export function useTrapGeneration() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  async function generate(
    userPrompt: string,
    options?: TrapGenerationOptions,
  ): Promise<TrapAiGenerated | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";
    let textUsage: TextUsage | undefined;
    let imgUsage: ImageUsage | undefined;

    try {
      const textProvider = getTextProvider();
      const imageProvider = getImageProvider();

      const systemContent = `${TRAP_SYSTEM_PROMPT}${buildCampaignContext({
        setting: settingPrompt,
      })}${INJECTION_GUARD_SUFFIX}`;

      const constraints: string[] = [];
      if (options?.trap_type) constraints.push(`Trap Type: ${options.trap_type}`);
      if (options?.cr) constraints.push(`CR: ${options.cr}`);

      const wrappedPrompt = wrapUserInput(userPrompt);
      const userContent = constraints.length
        ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}`
        : wrappedPrompt;

      const { content, usage: _textUsage } = await textProvider.complete(systemContent, userContent);
      textUsage = _textUsage;
      const trapData = JSON.parse(content) as TrapAiResult;

      let image_url: string | null = null;

      if (options?.generateImage !== false && auth.user) {
        startAiQuotes("image");
        try {
          let b64: string | null = null;
          const openAiKey = campaign.decryptedOpenAiKey;

          if (options?.groupPortraitUrl && openAiKey) {
            b64 = await generateWithPartyReference(
              [settingPrompt, trapData.image_prompt].filter(Boolean).join(" — "),
              options.groupPortraitUrl,
              openAiKey,
            );
            // Direct OpenAI edit call — log as 1 image with known model
            if (b64) {
              const model = (typeof localStorage !== "undefined" ? localStorage.getItem(OPENAI_IMAGE_MODEL_KEY) : null) ?? "gpt-image-2";
              imgUsage = { model, provider: "openai", image_count: 1 };
            }
          }

          if (!b64) {
            const imagePrompt = [IMAGE_BASE_PROMPT, settingPrompt, trapData.image_prompt]
              .filter(Boolean)
              .join(" — ");
            const { b64: _b64, usage: _imgUsage } = await imageProvider.generate(imagePrompt, "1024x1536");
            b64 = _b64;
            imgUsage = _imgUsage;
          }

          if (b64) {
            image_url = await uploadWithVariants({
              bucket: "trapImages",
              userId: auth.user.id,
              blob: b64ToBlob(b64),
            });
          }
        } catch {
          // image generation failure is non-fatal
        }
      }

      logUsage({ reason: "trap_generation", textUsage, imageUsage: imgUsage });
      return { ...trapData, image_url };
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
