/*
 * Brush tips from words (#1181): one call to `paint-brush-tips` returns a 1024x1024 sheet of four separate marks
 * (black on white, 2x2), and each quarter becomes a tip. The call, the decoding and the campaign are handed in
 * so the splitting and the error wording are tested without a model, a network or a canvas.
 */
import { aiOffered } from "@/scriptorium/illuminator/lib/aiOffer";
import { computed, ref } from "vue";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { pixelsFromBase64Png } from "./brushes/decodeMark";
import { quadrantOf, tipFromImage, type RgbaPixels } from "./brushes/tipFromImage";
import type { TipImage } from "./engine/types";

/** The same bounds the function enforces; checked here so a wrong length never costs a call. */
export const DESCRIPTION_MIN = 3;
export const DESCRIPTION_MAX = 200;

export type DescribedTip = { ok: true; tip: TipImage } | { ok: false; message: string };

export interface DescribedTipsDeps {
  /** Asks the function for the sheet; resolves to its base64 PNG. Rejects with the function's own message. */
  fetchSheet(campaignId: string, description: string): Promise<string>;
  decode(b64: string): Promise<RgbaPixels>;
}

const REFUSALS: Record<string, string> = {
  forbidden: "Only the campaign's DM can describe a brush.",
  ai_disabled: "AI features are switched off for this campaign.",
  invalid_description: `Describe the brush in ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters.`,
};

/** The function's refusal codes as sentences; credit and rate-limit messages are already sentences. */
export function readableRefusal(message: string): string {
  return REFUSALS[message] ?? message;
}

const browserDeps: DescribedTipsDeps = {
  async fetchSheet(campaignId, description) {
    const { data, error } = await supabase.functions.invoke("paint-brush-tips", { body: { campaign_id: campaignId, description } });
    if (error) throw new Error(readableRefusal(await edgeErrorMessage(error)));
    const sheet = data as { image_b64?: string; error?: string } | null;
    if (sheet?.error) throw new Error(readableRefusal(sheet.error));
    if (!sheet?.image_b64) throw new Error("The brush sheet came back empty.");
    return sheet.image_b64;
  },
  decode: pixelsFromBase64Png,
};

/** The description as the function will read it, or the reason it will not be sent. */
export function checkDescription(raw: string): { ok: true; description: string } | { ok: false; message: string } {
  const description = raw.trim();
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) return { ok: false, message: REFUSALS.invalid_description };
  return { ok: true, description };
}

/** A sheet cut into its four quarters, each made into a tip (or the reason it could not be). */
export function tipsFromSheet(sheet: RgbaPixels): DescribedTip[] {
  return ([0, 1, 2, 3] as const).map((i) => tipFromImage(quadrantOf(sheet, i)));
}

export function useDescribedTips(deps: DescribedTipsDeps = browserDeps) {
  const campaign = useCampaignStore();
  const busy = ref(false);
  const error = ref<string | null>(null);

  /** The four tips for a description; null (with `error` set) when nothing was made. */
  async function describe(raw: string, campaignId: string | null): Promise<DescribedTip[] | null> {
    if (busy.value) return null;
    error.value = null;
    const checked = checkDescription(raw);
    if (!checked.ok) {
      error.value = checked.message;
      return null;
    }
    // AI is per campaign: the book's campaign must be the active one, with AI on.
    if (!aiOffered(campaignId, campaign)) {
      error.value = REFUSALS.ai_disabled;
      return null;
    }
    busy.value = true;
    try {
      const tips = tipsFromSheet(await deps.decode(await deps.fetchSheet(campaignId, checked.description)));
      if (tips.every((t) => !t.ok)) {
        error.value = "None of the four marks could be used. Try describing it again.";
        return null;
      }
      return tips;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "The brush sheet could not be made.";
      return null;
    } finally {
      busy.value = false;
    }
  }

  return { busy, error, describe };
}

/** What the call costs: the `paint_brush_tips` price on OpenAI, which is what the function charges (one square picture). */
export function useDescribedTipsCost() {
  const { costOf } = useAiCredits();
  const { imageMultiplierFor } = useProviderConfig();
  return { credits: computed(() => wholeCredits(costOf("paint_brush_tips") * imageMultiplierFor("openai"))) };
}
