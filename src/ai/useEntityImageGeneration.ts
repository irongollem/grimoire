import { ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useImageUpload } from "@/composables/useImageUpload";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { getTextProvider, getImageProvider, OPENAI_IMAGE_MODEL_KEY } from "./providers";
import { fetchImageBasePrompt } from "./systemPrompts";
import { buildImagePromptAuthorSystem, buildSimpleImagePrompt } from "./imagePrompt";
import { buildCampaignContext, b64ToBlob, wrapUserInput } from "./utils";
import { startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { logUsage } from "@/composables/ai/useAiCredits";
import { useImageGenerationLog, type ImageGenKind } from "@/composables/ai/useImageGenerationLog";
import { buildAiProvenance, type AiProvenance } from "@/ai/provenance";
import { markGeneratedImage } from "@edge-shared/provenance/mark.ts";
import { sniffImageFormat } from "@edge-shared/provenance/sniff.ts";
import { readXmpFromWebp, readXmpFromPng, readXmpFromJpeg } from "@edge-shared/provenance/embed.ts";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";
const IMAGE_SIZE = "1024x1536";
/** Mirror of the edge function's AI_PROMPT_LIMIT_LONG — clamp entity facts before sending. */
const CONTEXT_LIMIT = 2000;

interface GenerateEntityImageResponse {
  image_b64: string | null;
  error?: string;
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/png":  "png",
  "image/jpeg": "jpeg",
};

/** Reads an XMP packet out of `bytes`, if any, for the sniffed `contentType`. Used to detect a server-marked round-trip so the local path never marks over it. */
function readEmbeddedXmp(bytes: Uint8Array, contentType: string): string | null {
  switch (contentType) {
    case "image/webp": return readXmpFromWebp(bytes);
    case "image/png":  return readXmpFromPng(bytes);
    case "image/jpeg": return readXmpFromJpeg(bytes);
    default:           return null;
  }
}

export interface GenerateEntityImageOptions {
  /** Image-job kind — selects the subject noun for the prompt author (npc_portrait, monster, item, …). */
  kind: string;
  /** The entity's salient facts (name, type, appearance, description) the text model authors a prompt from. */
  context: string;
  /** Source entity id — recorded on the Gallery row so the image links back to its entity. */
  targetId?: string | null;
}

/**
 * Generate AI art for an entity that ALREADY exists.
 *
 * Mirrors the create-flow's two-step "AI weighs in → image" pipeline: a text
 * model first authors a visual prompt from the entity's facts, then the image
 * model renders it. The resulting art is uploaded (with FocalImage variants)
 * and the public URL is returned for the caller to persist.
 *
 * `bucketId` is the storage bucket *id* (e.g. "monster-images") — the same value
 * EntityImageBlock already passes to ImageUpload.
 */
export function useEntityImageGeneration(bucketId: string) {
  const campaign = useCampaignStore();
  const { upload } = useImageUpload(bucketId);
  const { logImageGeneration } = useImageGenerationLog();

  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  /**
   * `localProv` is only ever passed by the local (BYOK) path — the server
   * path's `image_b64` already carries an XMP mark embedded server-side
   * (generate-entity-image, before the response leaves the edge function),
   * so it's never re-marked here. The real content type is sniffed from the
   * decoded bytes, never assumed to be webp — Gemini returns PNG, and marking
   * with the wrong format-specific embedder would silently no-op.
   */
  async function uploadB64(b64: string, localProv: AiProvenance | null = null): Promise<string | null> {
    const bytes = new Uint8Array(await b64ToBlob(b64).arrayBuffer());
    const contentType = sniffImageFormat(bytes) ?? "image/webp";
    const alreadyMarked = readEmbeddedXmp(bytes, contentType) !== null;
    // Re-wrapped via the ArrayLike<number> constructor overload: mark.ts's
    // markGeneratedImage has a bare `Uint8Array` return annotation, which
    // widens to `Uint8Array<ArrayBufferLike>` — not assignable to `BlobPart`.
    const finalBytes = new Uint8Array(localProv && !alreadyMarked ? markGeneratedImage(bytes, contentType, localProv) : bytes);
    const file = new File([finalBytes], `ai-art.${EXT_BY_CONTENT_TYPE[contentType] ?? "webp"}`, { type: contentType });
    const url = await upload(file);
    if (!url) throw new Error("Failed to upload the generated image.");
    return url;
  }

  async function generate(options: GenerateEntityImageOptions): Promise<string | null> {
    if (isGenerating.value) return null;
    if (!campaign.isAiEnabled) {
      error.value = "AI features are disabled for this campaign.";
      return null;
    }
    const campaignId = campaign.activeCampaign?.id;
    if (!campaignId) {
      error.value = "No active campaign selected.";
      return null;
    }

    isGenerating.value = true;
    error.value = null;
    startAiQuotes("text");

    const clamped: GenerateEntityImageOptions = {
      kind: options.kind,
      context: options.context.slice(0, CONTEXT_LIMIT),
    };

    try {
      const isLocalMode =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(LOCAL_MODE_KEY) === "local";

      const url = isLocalMode
        ? await generateClientSide(clamped)
        : await generateServerSide(clamped, campaignId);

      if (url) {
        void logImageGeneration({
          kind: options.kind as ImageGenKind,
          imageUrl: url,
          prompt: clamped.context,
          size: IMAGE_SIZE,
          provider: "openai",
          targetId: options.targetId ?? null,
        });
      }
      return url;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      isGenerating.value = false;
      stopAiQuotes();
    }
  }

  // ── Server-side path (platform / campaign key, decrypted in the Edge Function) ──
  async function generateServerSide(
    options: GenerateEntityImageOptions,
    campaignId: string,
  ): Promise<string | null> {
    const imageModel =
      (typeof localStorage !== "undefined" ? localStorage.getItem(OPENAI_IMAGE_MODEL_KEY) : null) ??
      "gpt-image-2";

    const { data, error: fnError } = await supabase.functions.invoke("generate-entity-image", {
      body: {
        campaign_id: campaignId,
        kind:        options.kind,
        context:     options.context,
        image_model: imageModel,
      },
    });

    if (fnError) throw new Error(await edgeErrorMessage(fnError));
    const res = data as GenerateEntityImageResponse;
    if (res?.error) throw new Error(res.error);
    if (!res?.image_b64) throw new Error("The image generator returned no image.");

    startAiQuotes("image");
    return await uploadB64(res.image_b64);
  }

  // ── Client-side path (BYOK local mode — key never leaves the browser) ──────────
  async function generateClientSide(options: GenerateEntityImageOptions): Promise<string | null> {
    const settingPrompt = campaign.activeCampaign?.ai_setting_prompt ?? "";

    // 1. Author a visual prompt from the entity's facts (the "AI weighs in" step).
    const textProvider = getTextProvider();
    const authorSystem =
      buildImagePromptAuthorSystem(options.kind) +
      buildCampaignContext({ setting: settingPrompt });
    const { content: subject, usage: textUsage } = await textProvider.complete(
      authorSystem,
      wrapUserInput(options.context),
    );
    logUsage({ reason: "entity_image_prompt", textUsage });

    if (!subject.trim()) throw new Error("The AI did not return an image description.");

    // 2. Render the image, layering the campaign style + setting under the subject.
    startAiQuotes("image");
    const imageBasePrompt = await fetchImageBasePrompt();
    const imageProvider = getImageProvider();
    const imagePrompt = buildSimpleImagePrompt({
      base: imageBasePrompt,
      setting: settingPrompt,
      subject,
    });
    const { b64, usage: imageUsage } = await imageProvider.generate(imagePrompt, IMAGE_SIZE);
    logUsage({ reason: "entity_image", imageUsage });

    const prov = buildAiProvenance(options.kind, imageUsage.provider, imageUsage.model);
    return await uploadB64(b64, prov);
  }

  return { isGenerating, error, generate };
}
