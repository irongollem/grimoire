/**
 * Brush tips described in words (#1181): the Illuminator's painter describes a brush ("a wet sponge dab")
 * and one call asks the image model for ONE sheet of four separate marks, black on white, 2x2. The client
 * cuts the sheet into four tips. One call costs what one picture costs.
 *
 * Cloned from illuminate-picture: OpenAI only and PLATFORM KEYS ONLY. A brush
 * belongs to the painter, so there is no document. The model is a setting (provider_config.brush_tip_model).
 * Synchronous, nothing stored here: the result carries the AI-made mark (EU AI Act Art 50(2)).
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { BRUSH_TIPS_SIZE, brushTipsPrompt, validateBrushTipsRequest } from "./validateBrushTipsRequest.ts";

/** What one call is priced and logged as: a row in ai_generation_credit_costs. */
const GENERATION_TYPE = "paint_brush_tips";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(serveUser(async ({ user, req, report }) => {
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  if (!body) return jsonError(400, "invalid_body", "Need { campaign_id, description }.");
  const validation = validateBrushTipsRequest(body);
  if (!validation.ok) {
    return jsonError(400, validation.error, validation.error === "invalid_description"
      ? "Describe the brush in a few words."
      : "Need { campaign_id, description }.");
  }
  const { campaign_id: campaignId, description } = validation.request;

  // Cheap, early, before any credit reservation: DM first, then the AI switch.
  const load = await loadAiCampaign(admin, campaignId, user.id);
  if (!load.ok) return load.response;

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai"]),
    fetchProviderConfigs(admin, ["openai"]),
  ]);
  const img = resolveImageProvider({
    imageProvider: "openai",
    pinned: true,
    platformKeys: { openai: platformKeys.openai },
    providerConfigs,
    surface: "brush_tip",
  });
  if (!img) return jsonError(422, "no_image_provider", "No image provider is configured.");

  // Throttle before any work the caller can make the server do.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // One square picture: the size multiplier is 1 at 1024x1024. Everything that can be read is read before the hold.
  const baseCost = await fetchCreditCost(admin, GENERATION_TYPE);
  const cost = wholeCredits(applyMultiplier(baseCost, img.imageMultiplier));
  const quality = await resolveImageQuality(admin, GENERATION_TYPE, img);

  return withCreditHold(admin, { payerId: user.id, reason: GENERATION_TYPE, cost, report }, async (hold) => {
    let imgResult;
    try {
      imgResult = await generateImage({
        provider: img.provider, model: img.model, apiKey: img.apiKey,
        screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: GENERATION_TYPE },
        prompt: brushTipsPrompt(description), size: BRUSH_TIPS_SIZE, quality, boostStyle: false,
        background: "opaque",
      });
    } catch (e) {
      if (isPromptRejected(e)) return jsonError(400, "prompt_rejected", e.message);
      console.error("Paint brush tips failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Brush tips failed");
    }

    hold.charge(GENERATION_TYPE, {
      cost,
      log: {
        model: img.model, quality, size: BRUSH_TIPS_SIZE,
        provider: imgResult.usage.provider, image_count: 1,
        input_tokens:       imgResult.usage.input_tokens       || undefined,
        input_image_tokens: imgResult.usage.input_image_tokens || undefined,
        output_tokens:      imgResult.usage.output_tokens      || undefined,
      },
    });

    // EU AI Act Art 50(2): mark before the bytes leave this pipeline. A failure here throws, and the hold then
    // writes the charge as a free line.
    const prov: AiProvenance = {
      generatorType: GENERATION_TYPE,
      provider: imgResult.usage.provider,
      model: img.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };
    return json({ image_b64: markGeneratedImageB64(imgResult.b64, imgResult.contentType, prov) });
  });
}));
