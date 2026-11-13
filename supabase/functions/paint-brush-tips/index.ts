/**
 * Brush tips described in words (#1181): the Illuminator's painter describes a brush ("a wet sponge dab")
 * and one call asks the image model for ONE sheet of four separate marks, black on white, 2x2. The client
 * cuts the sheet into four tips. One call costs what one picture costs.
 *
 * Cloned from illuminate-picture: OpenAI only and PLATFORM KEYS ONLY, never a campaign's own key. A brush
 * belongs to the painter, so there is no document. The model is a setting (provider_config.brush_tip_model).
 * Synchronous, nothing stored here: the result carries the AI-made mark (EU AI Act Art 50(2)).
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  reservationFailureResponse,
  wholeCredits,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { refusalFor } from "./refusalFor.ts";
import { BRUSH_TIPS_SIZE, brushTipsPrompt, validateBrushTipsRequest } from "./validateBrushTipsRequest.ts";

/** What one call is priced and logged as: a row in ai_generation_credit_costs. */
const GENERATION_TYPE = "paint_brush_tips";

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }
  const validation = validateBrushTipsRequest(body);
  if (!validation.ok) return jsonError(validation.error, 400);
  const { campaign_id: campaignId, description } = validation.request;

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) {
    console.error("paint-brush-tips: campaign read failed", campaignError.message);
    return jsonError("campaign_read_failed", 500);
  }
  if (!campaign) return jsonError("not_found", 404);
  // Cheap, early, before any credit reservation.
  const refusal = refusalFor({
    isDm: await isCampaignDm(admin, campaign, user.id),
    aiEnabled: campaign.ai_enabled === true,
  });
  if (refusal) return jsonError(refusal.error, refusal.status);

  // Throttle before any work the caller can make the server do.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return jsonError("rate_limited", 429);

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai"]),
    fetchProviderConfigs(admin, ["openai"]),
  ]);
  const img = resolveImageProvider({
    imageProvider: "openai",
    campaignKeys: {}, // deliberately empty: no BYOK path, see file doc
    pinned: true,
    platformKeys: { openai: platformKeys.openai },
    providerConfigs,
    surface: "brush_tip",
  });
  if (!img) return jsonError("no_image_provider", 422);

  // One square picture: the size multiplier is 1 at 1024x1024.
  const baseCost = await fetchCreditCost(admin, GENERATION_TYPE);
  const cost = wholeCredits(applyMultiplier(baseCost, img.imageMultiplier));

  const reservation = await reserveCredits(admin, user.id, cost, GENERATION_TYPE);
  if (!reservation.ok) return reservationFailureResponse(reservation);

  const quality = await resolveImageQuality(admin, GENERATION_TYPE, img);

  let imgResult;
  try {
    imgResult = await generateImage({
      provider: img.provider, model: img.model, apiKey: img.apiKey,
      screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: GENERATION_TYPE },
      prompt: brushTipsPrompt(description), size: BRUSH_TIPS_SIZE, quality, boostStyle: false,
      background: "opaque",
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (isPromptRejected(e)) return jsonError(e.message, 400);
    console.error("Paint brush tips failed:", e);
    return jsonError(e instanceof Error ? e.message : "Brush tips failed", 502);
  }

  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, GENERATION_TYPE, false, cost, {
    model: img.model, quality, size: BRUSH_TIPS_SIZE,
    provider: imgResult.usage.provider, image_count: 1,
    input_tokens:       imgResult.usage.input_tokens       || undefined,
    input_image_tokens: imgResult.usage.input_image_tokens || undefined,
    output_tokens:      imgResult.usage.output_tokens      || undefined,
  });

  // EU AI Act Art 50(2): mark before the bytes leave this pipeline.
  const prov: AiProvenance = {
    generatorType: GENERATION_TYPE,
    provider: imgResult.usage.provider,
    model: img.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({ image_b64: markGeneratedImageB64(imgResult.b64, imgResult.contentType, prov) }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
