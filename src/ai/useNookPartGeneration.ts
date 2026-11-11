import { computed, ref, type ComputedRef } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import { startAiQuotes, stopAiQuotes } from "@/ai/aiGenerationState";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { blobToBase64 } from "@/lib/blobToBase64";

type NookPartMode = "paint" | "lift" | "fill";

interface NookPartResponse {
  image_b64: string | null;
  error?: string;
}

/**
 * What one picture from the nook-part generator costs: an `entity_cutout` picture at 1024x1024 on OpenAI,
 * which is what generate-nook-part charges per call. Paint is one picture, Lift is two (the cut-out and the
 * fill behind it), so the Lift button shows `2 * picture`. Same formula as EntityImageBlock's cutout cost.
 */
export function useNookPartCost(): { picture: ComputedRef<number> } {
  const { costOf } = useAiCredits();
  const { imageMultiplierFor } = useProviderConfig();
  const picture = computed(() => wholeCredits(costOf("entity_cutout", { size: "1024x1024" }) * imageMultiplierFor("openai")));
  return { picture };
}

/**
 * The three ways a DM gets a cut-out for a nook (Book Nook, #1142), all through `generate-nook-part`:
 *
 * - `paint` a new part that matches the nook's room (the server reads the room from the nook row);
 * - `lift` a thing out of the client's crop of a picture, on a transparent background;
 * - `fill` the gap a lifted thing leaves, from the crop and a mask (transparent where to repaint).
 *
 * Each resolves to the generated picture as a Blob and uploads nothing: the studio stores it with
 * `uploadNookImage`. Server-only and platform-keys-only, like useCutoutGeneration. A failure throws an
 * Error carrying the server's message, and is also left in `error`.
 */
export function useNookPartGeneration() {
  const campaign = useCampaignStore();
  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  async function run(
    nookId: string,
    mode: NookPartMode,
    extra: { subject?: string; image?: Blob; mask?: Blob },
  ): Promise<Blob> {
    if (isGenerating.value) throw new Error("A part is already being made.");
    if (!campaign.isAiEnabled) throw failed("AI features are disabled for this campaign.");
    const campaignId = campaign.activeCampaign?.id;
    if (!campaignId) throw failed("No active campaign selected.");

    isGenerating.value = true;
    error.value = null;
    startAiQuotes("image");
    try {
      const body: Record<string, string> = { campaign_id: campaignId, nook_id: nookId, mode };
      if (extra.subject) body.subject = extra.subject;
      if (extra.image) body.image_b64 = await blobToBase64(extra.image);
      if (extra.mask) body.mask_b64 = await blobToBase64(extra.mask);

      const { data, error: fnError } = await supabase.functions.invoke("generate-nook-part", { body });
      if (fnError) throw new Error(await edgeErrorMessage(fnError));
      const res = data as NookPartResponse;
      if (res?.error) throw new Error(res.error);
      if (!res?.image_b64) throw new Error("The nook part generator returned no image.");

      // OpenAI edits are always requested as webp (imageGen.ts), so the bytes are reliably webp.
      const bytes = Uint8Array.from(atob(res.image_b64), (c) => c.charCodeAt(0));
      return new Blob([bytes], { type: "image/webp" });
    } catch (e) {
      throw failed(e instanceof Error ? e.message : "Nook part generation failed");
    } finally {
      isGenerating.value = false;
      stopAiQuotes();
    }
  }

  function failed(message: string): Error {
    error.value = message;
    return new Error(message);
  }

  return {
    isGenerating,
    error,
    paint: (nookId: string, subject: string) => run(nookId, "paint", { subject }),
    lift: (nookId: string, crop: Blob, hint?: string) => run(nookId, "lift", { image: crop, subject: hint }),
    fill: (nookId: string, crop: Blob, mask: Blob) => run(nookId, "fill", { image: crop, mask }),
  };
}
