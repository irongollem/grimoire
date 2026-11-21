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
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import { hasLikenessAcknowledgement } from "../_shared/provenance/likeness-gate.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { pngBlob } from "../_shared/pngRequest.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { illuminatePrompt, needsLikenessAck, validateIlluminateRequest } from "./validateIlluminateRequest.ts";

/** What one call is priced and logged as: a row in ai_generation_credit_costs. */
const GENERATION_TYPE = "illuminate_picture";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(serveUser(async ({ user, req, report }) => {
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  if (!body) return jsonError(400, "invalid_body", "The request was not valid.");
  const validation = validateIlluminateRequest(body);
  if (!validation.ok) return jsonError(400, validation.error, "That picture request was not valid.");
  const { campaign_id: campaignId, document_id: documentId, action, size, image_b64, mask_b64, look } = validation.request;

  // Cheap, early, before any credit reservation: DM first, then the AI switch.
  const load = await loadAiCampaign(admin, campaignId, user.id);
  if (!load.ok) return load.response;

  // Ink sketch, watercolour and match restyle a picture that may show a real person. The client pre-flights the
  // same check through useLikenessGate.
  if (needsLikenessAck(action) && !(await hasLikenessAcknowledgement(admin, user.id))) {
    return jsonError(403, "likeness_acknowledgement_required", "Acknowledge the likeness notice before restyling a picture.");
  }

  // The document must be the caller's own, in the campaign they are DM of: never trust a bare document id.
  const { data: document, error: documentError } = await admin
    .from("scriptorium_documents")
    .select("id")
    .eq("id", documentId)
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!document) return jsonError(404, "document_not_found", "Document not found.");

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
  if (!img) return jsonError(422, "no_image_provider", "No image provider is configured.");
  // Pinned to openai, so this is a guard: a mask cannot be sent to any other provider.
  if (action === "extend" && img.provider !== "openai") {
    return jsonError(503, "extend_unavailable", "Extending a picture is not available right now.");
  }

  // Throttle before any work the caller can make the server do.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  const baseCost = await fetchCreditCost(admin, GENERATION_TYPE);
  const cost = wholeCredits(applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(size));
  const quality = await resolveImageQuality(admin, GENERATION_TYPE, img);

  return withCreditHold(admin, { payerId: user.id, reason: GENERATION_TYPE, cost, report }, async (hold) => {
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
      if (isPromptRejected(e)) return jsonError(400, "prompt_rejected", e.message);
      console.error("Illuminate picture failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Picture action failed");
    }

    hold.charge(GENERATION_TYPE, {
      cost, isByok: false,
      log: {
        model: img.model, quality, size,
        provider: imgResult.usage.provider, image_count: 1,
        input_tokens:       imgResult.usage.input_tokens       || undefined,
        input_image_tokens: imgResult.usage.input_image_tokens || undefined,
        output_tokens:      imgResult.usage.output_tokens      || undefined,
      },
    });

    // EU AI Act Art 50(2): mark before the bytes leave this pipeline (the client uploads image_b64). A failure
    // throws, and the hold then writes the charge as a free line.
    const prov: AiProvenance = {
      generatorType: `illuminate_${action}`,
      provider: imgResult.usage.provider,
      model: img.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };
    return json({ image_b64: markGeneratedImageB64(imgResult.b64, imgResult.contentType, prov) });
  });
}));
