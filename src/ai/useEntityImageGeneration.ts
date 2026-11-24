import type { BucketId } from "@/lib/storage";
import { ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useImageUpload } from "@/composables/useImageUpload";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { b64ToBlob } from "./utils";
import { sniffImageFormat } from "@edge-shared/provenance/sniff.ts";
import { startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { useImageGenerationLog, type ImageGenKind } from "@/composables/ai/useImageGenerationLog";

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
export function useEntityImageGeneration(bucketId: BucketId) {
  const campaign = useCampaignStore();
  const { upload } = useImageUpload(bucketId);
  const { logImageGeneration } = useImageGenerationLog();

  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  /** The server marks the picture's provenance before it leaves the edge function, so the bytes are uploaded as they came. The real content type is sniffed, never assumed to be webp. */
  async function uploadB64(b64: string): Promise<string | null> {
    const bytes = new Uint8Array(await b64ToBlob(b64).arrayBuffer());
    const contentType = sniffImageFormat(bytes) ?? "image/webp";
    const file = new File([bytes], `ai-art.${EXT_BY_CONTENT_TYPE[contentType] ?? "webp"}`, { type: contentType });
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
      const url = await generateServerSide(clamped, campaignId);

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

  // ── Server-side path (the key is resolved in the Edge Function) ──
  async function generateServerSide(
    options: GenerateEntityImageOptions,
    campaignId: string,
  ): Promise<string | null> {
    const { data, error: fnError } = await supabase.functions.invoke("generate-entity-image", {
      body: {
        campaign_id: campaignId,
        kind:        options.kind,
        context:     options.context,
      },
    });

    if (fnError) throw new Error(await edgeErrorMessage(fnError));
    const res = data as GenerateEntityImageResponse;
    if (res?.error) throw new Error(res.error);
    if (!res?.image_b64) throw new Error("The image generator returned no image.");

    startAiQuotes("image");
    return await uploadB64(res.image_b64);
  }

  return { isGenerating, error, generate };
}
