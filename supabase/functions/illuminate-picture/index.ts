/**
 * AI picture actions in the Scriptorium's Illuminator (#1176 story 10): cut out, ink sketch, watercolour,
 * extend to the page edge and match the book's look, on a picture the DM is editing in a document.
 *
 * Cloned from generate-nook-part: OpenAI only (transparent output and edit masks are OpenAI features) and
 * PLATFORM KEYS ONLY, never a campaign's own key. The client sends the picture as PNG bytes; the server never
 * fetches a URL the client names. Synchronous, no upload here: the client stores the returned bytes, which carry
 * the AI-made mark (EU AI Act Art 50(2)).
 *
 * Ink sketch, watercolour and match restyle a picture that may show a real person, so they refuse a caller who
 * has not acknowledged the likeness notice (the client pre-flights the same check through useLikenessGate).
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
  sizeMultiplier,
  wholeCredits,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import { hasLikenessAcknowledgement } from "../_shared/provenance/likeness-gate.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { pngBlob } from "../_shared/pngRequest.ts";
import { refusalFor } from "./refusalFor.ts";
import { illuminatePrompt, needsLikenessAck, validateIlluminateRequest } from "./validateIlluminateRequest.ts";

/** What one call is priced and logged as: a row in ai_generation_credit_costs. */
const GENERATION_TYPE = "illuminate_picture";

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
  const validation = validateIlluminateRequest(body);
  if (!validation.ok) return jsonError(validation.error, 400);
  const { campaign_id: campaignId, document_id: documentId, action, size, image_b64, mask_b64, look } = validation.request;

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) {
    console.error("illuminate-picture: campaign read failed", campaignError.message);
    return jsonError("campaign_read_failed", 500);
  }
  if (!campaign) return jsonError("not_found", 404);
  // Cheap, early, before any credit reservation. The client pre-flights the likeness check too.
  const refusal = refusalFor({
    isDm: await isCampaignDm(admin, campaign, user.id),
    aiEnabled: campaign.ai_enabled === true,
    likenessAcknowledged: needsLikenessAck(action) ? await hasLikenessAcknowledgement(admin, user.id) : false,
    action,
  });
  if (refusal) return jsonError(refusal.error, refusal.status);

  // Throttle before any work the caller can make the server do.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return jsonError("rate_limited", 429);

  // The document must be the caller's own, in the campaign they are DM of: never trust a bare document id.
  const { data: document, error: documentError } = await admin
    .from("scriptorium_documents")
    .select("id")
    .eq("id", documentId)
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (documentError) {
    console.error("illuminate-picture: document read failed", documentError.message);
    return jsonError("document_read_failed", 500);
  }
  if (!document) return jsonError("not_found", 404);

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai"]),
    fetchProviderConfigs(admin, ["openai"]),
  ]);
  const img = resolveImageProvider({
    imageProvider: "openai",
    campaignKeys: {}, // deliberately empty: no BYOK path, see file doc
    pinned: true, // transparent output and edit masks are OpenAI-only capabilities
    platformKeys: { openai: platformKeys.openai },
    providerConfigs,
  });
  if (!img) return jsonError("no_image_provider", 422);
  // Pinned to openai, so this is a guard: a mask cannot be sent to any other provider.
  if (action === "extend" && img.provider !== "openai") return jsonError("extend_unavailable", 503);

  const baseCost = await fetchCreditCost(admin, GENERATION_TYPE);
  const cost = wholeCredits(applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(size));

  const reservation = await reserveCredits(admin, user.id, cost, GENERATION_TYPE);
  if (!reservation.ok) return reservationFailureResponse(reservation);

  const quality = await resolveImageQuality(admin, GENERATION_TYPE, img);

  let imgResult;
  try {
    imgResult = await generateImage({
      provider: img.provider, model: img.model, apiKey: img.apiKey,
      screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: GENERATION_TYPE },
      prompt: illuminatePrompt(action, look), size, quality, boostStyle: false,
      sourceImages: [pngBlob(image_b64)],
      mask: mask_b64 ? pngBlob(mask_b64) : undefined,
      background: action === "cutout" ? "transparent" : "opaque",
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (isPromptRejected(e)) return jsonError(e.message, 400);
    console.error("Illuminate picture failed:", e);
    return jsonError(e instanceof Error ? e.message : "Picture action failed", 502);
  }

  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, GENERATION_TYPE, false, cost, {
    model: img.model, quality, size,
    provider: imgResult.usage.provider, image_count: 1,
    input_tokens:       imgResult.usage.input_tokens       || undefined,
    input_image_tokens: imgResult.usage.input_image_tokens || undefined,
    output_tokens:      imgResult.usage.output_tokens      || undefined,
  });

  // EU AI Act Art 50(2): mark before the bytes leave this pipeline (the client uploads image_b64).
  const prov: AiProvenance = {
    generatorType: `illuminate_${action}`,
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
