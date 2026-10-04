import type { BucketId } from "@/lib/storage";
import { ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useImageUpload } from "@/composables/useImageUpload";
import { useImageGenerationLog, type ImageGenKind } from "@/composables/ai/useImageGenerationLog";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { startAiQuotes, stopAiQuotes } from "@/ai/aiGenerationState";

export type CutoutTable = "monsters" | "npcs";

export interface GenerateCutoutOptions {
  table: CutoutTable;
  /** The entity's id — both the row `generate-cutout` reads the picture from and the Gallery back-link target. */
  id: string;
  /** Storage bucket id (e.g. "monster-images") — the same value EntityImageBlock already passes to ImageUpload. */
  bucket: BucketId;
}

interface GenerateCutoutResponse {
  image_b64: string | null;
  error?: string;
}

/**
 * Generate a cutout FROM an entity's existing picture (#917 story 5): the
 * server sends the picture to the image model as an edit ("same figure, drop
 * the background"), so the cutout always matches the picture. Server-only —
 * there is no local/BYOK branch, mirroring the platform-keys-only choice
 * Simulacrum makes (context/features/simulacrum.md) — generate-cutout never
 * reads a campaign's own key, so this composable never offers one either.
 */
export function useCutoutGeneration() {
  const campaign = useCampaignStore();
  const { logImageGeneration } = useImageGenerationLog();

  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  async function generate(options: GenerateCutoutOptions): Promise<string | null> {
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
    startAiQuotes("image");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-cutout", {
        body: { campaign_id: campaignId, table: options.table, id: options.id },
      });
      if (fnError) throw new Error(await edgeErrorMessage(fnError));
      const res = data as GenerateCutoutResponse;
      if (res?.error) throw new Error(res.error);
      if (!res?.image_b64) throw new Error("The cutout generator returned no image.");

      // generate-cutout is OpenAI-only and always requests output_format
      // "webp" (see imageGen.ts's openaiGenerate), so the response bytes are
      // reliably webp — unlike generate-entity-image, which can also receive
      // Gemini's png and has to sniff the real format before naming the file.
      const bytes = Uint8Array.from(atob(res.image_b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], "cutout.webp", { type: "image/webp" });
      const { upload } = useImageUpload(options.bucket);
      const url = await upload(file);
      if (!url) throw new Error("Failed to upload the generated cutout.");

      void logImageGeneration({
        kind: (options.table === "monsters" ? "monster_cutout" : "npc_cutout") as ImageGenKind,
        imageUrl: url,
        targetId: options.id,
        targetColumn: "cutout_url",
        size: "1024x1536",
        provider: "openai",
      });

      return url;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Cutout generation failed";
      return null;
    } finally {
      isGenerating.value = false;
      stopAiQuotes();
    }
  }

  return { isGenerating, error, generate };
}
