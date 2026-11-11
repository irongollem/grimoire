import { ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import { uploadToBucket } from "@/lib/storage";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import type { ScriptoriumArtLook } from "@edge-shared/scriptoriumLookStyles.ts";
import { startAiQuotes, stopAiQuotes } from "@/ai/aiGenerationState";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { extendLayout, type AiSize, type ExtendLayout, type PageEdge } from "@/scriptorium/illuminator/lib/aiPicture";
import { prepareExtend, preparePicture, restoreOriginal } from "@/scriptorium/illuminator/lib/aiPictureCanvas";
import { loadDomImage } from "@/scriptorium/illuminator/lib/loadImage";

export type IlluminateAction = "cutout" | "ink" | "watercolour" | "extend" | "match";

/** These restyle a picture that may show a real person, so they ask for the likeness acknowledgement first. */
const NEEDS_LIKENESS: readonly IlluminateAction[] = ["ink", "watercolour", "match"];

interface IlluminateResponse {
  image_b64: string | null;
  error?: string;
}

/** Base64 of a blob's bytes, without the data-URL prefix. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export interface IlluminateRun {
  action: IlluminateAction;
  /** The picture to act on: the recipe's current base, so a second action builds on the first. */
  baseUrl: string;
  /** The document the picture is in; the server checks it belongs to the campaign and the caller. */
  documentId: string;
  userId: string;
  /** match: which book look to restyle to. The server owns the words; only the name travels. */
  look?: ScriptoriumArtLook;
  /** extend: the page edge the picture grows toward. */
  edge?: PageEdge;
}

/**
 * What one picture action costs at a size: the `illuminate_picture` price on OpenAI, which is what the
 * `illuminate-picture` function charges (base cost, the provider's image multiplier, then the size multiplier).
 */
export function useIlluminatePictureCost() {
  const { costOf } = useAiCredits();
  const { imageMultiplierFor } = useProviderConfig();
  return {
    costFor: (size: AiSize) => wholeCredits(costOf("illuminate_picture", { size }) * imageMultiplierFor("openai")),
  };
}

/**
 * AI picture actions for the Scriptorium's Illuminator (#1176 story 10), through `illuminate-picture`. The
 * client draws the picture (and, for extend, the margin and its mask), the server runs the model on platform
 * keys and returns marked bytes, and this stores them in the author's pictures and resolves to their URL. The
 * caller records that URL as the recipe's AI step. Resolves to null when the author declines the likeness
 * notice, which is no error. A failure throws an Error carrying the server's message, left in `error` too.
 */
export function useIlluminatePicture() {
  const campaign = useCampaignStore();
  const likeness = useLikenessGate();
  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  function failed(message: string): Error {
    error.value = message;
    return new Error(message);
  }

  async function run(opts: IlluminateRun): Promise<string | null> {
    if (isGenerating.value) throw new Error("A picture action is already running.");
    if (!campaign.isAiEnabled) throw failed("AI features are disabled for this campaign.");
    const campaignId = campaign.activeCampaign?.id;
    if (!campaignId) throw failed("No active campaign selected.");
    if (NEEDS_LIKENESS.includes(opts.action) && !(await likeness.ensureLikenessAck())) return null;

    isGenerating.value = true;
    error.value = null;
    startAiQuotes("image");
    try {
      const source = await loadDomImage(opts.baseUrl);
      let layout: ExtendLayout | null = null;
      if (opts.action === "extend") {
        if (!opts.edge) throw new Error("Choose the page edge to extend toward.");
        layout = extendLayout({ width: source.naturalWidth, height: source.naturalHeight }, opts.edge);
        if (!layout) throw new Error("This picture already fills that edge.");
      }
      const prepared = layout ? await prepareExtend(source, layout) : await preparePicture(source);

      const body: Record<string, string> = {
        campaign_id: campaignId,
        document_id: opts.documentId,
        action: opts.action,
        size: prepared.size,
        image_b64: await blobToBase64(prepared.image),
      };
      if (prepared.mask) body.mask_b64 = await blobToBase64(prepared.mask);
      if (opts.look) body.look = opts.look;

      const { data, error: fnError } = await supabase.functions.invoke("illuminate-picture", { body });
      if (fnError) throw new Error(await edgeErrorMessage(fnError));
      const res = data as IlluminateResponse;
      if (res?.error) throw new Error(res.error);
      if (!res?.image_b64) throw new Error("The picture action returned no image.");

      // OpenAI edits are always requested as webp (imageGen.ts), so the bytes are reliably webp.
      let result = new Blob([Uint8Array.from(atob(res.image_b64), (c) => c.charCodeAt(0))], { type: "image/webp" });
      if (layout) result = await restoreOriginal(result, source, layout);

      // The upload reads the AI mark in the bytes and registers the picture's provenance row.
      const url = await uploadToBucket({
        bucket: "assetImages",
        blob: result,
        path: `${opts.userId}/ill-ai-${crypto.randomUUID().slice(0, 8)}.webp`,
        contentType: "image/webp",
      });
      if (!url) throw new Error("Could not store the new picture.");
      return url;
    } catch (e) {
      throw failed(e instanceof Error ? e.message : "The picture action failed");
    } finally {
      isGenerating.value = false;
      stopAiQuotes();
    }
  }

  return { isGenerating, error, run };
}
