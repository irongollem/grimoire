/**
 * Nook part generation (Book Nook, #1142): the three ways a DM gets a cut-out for a nook.
 *
 *   paint  one new part, painted to match the nook's room (the room picture travels with the request, so
 *          the part matches its light).
 *   lift   isolate a thing in a picture the DM already has: the client sends its crop, we return it on a
 *          transparent background.
 *   fill   paint in the gap behind a lifted thing, from the crop and a mask, so the room is whole when the
 *          part moves.
 *
 * OpenAI only (transparent background and edit masks are OpenAI features) and PLATFORM KEYS ONLY, as
 * generate-cutout: a campaign's own key is never read. Every call is priced as one `entity_cutout` picture
 * at 1024x1024, so Paint is one picture and Lift, which the client runs as a lift then a fill, is two.
 *
 * Never fetches a client-supplied URL: the room picture is read from the nook row server-side and still
 * has to pass isSafeStorageUrl. No upload here; the client uploads the returned bytes.
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
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { pngBlob } from "../_shared/pngRequest.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import {
  NOOK_PART_SIZE,
  nookPartPrompt,
  validateNookPartRequest,
} from "./validateNookPartRequest.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** The URL of the nook scene's picture (the room), or null when the scene has none. */
function roomSrc(scene: unknown): string | null {
  const stack = (scene as { stack?: unknown } | null)?.stack;
  if (!Array.isArray(stack)) return null;
  // The picture is the layer with id "plate" (a Far part sorts before it); an older scene may lack the id, so fall back to the first layer.
  const layers = stack as { kind?: unknown; id?: unknown; src?: unknown }[];
  const first = layers.find((i) => i?.kind === "layer" && i.id === "plate") ?? layers[0];
  return first?.kind === "layer" && typeof first.src === "string" && first.src ? first.src : null;
}

serve(serveUser(async ({ user, req, report }) => {
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  if (!body) return jsonError(400, "invalid_body", "The request was not valid.");
  const validation = validateNookPartRequest(body);
  if (!validation.ok) return jsonError(400, validation.error, "That nook part request was not valid.");
  const { campaign_id: campaignId, nook_id: nookId, mode, subject, image_b64, mask_b64 } = validation.request;

  const load = await loadAiCampaign(admin, campaignId, user.id);
  if (!load.ok) return load.response;

  // Throttle before any work the caller can make the server do, the room's fetch included.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // The nook must belong to the campaign the caller is DM of: never trust a bare nook id.
  const { data: nook, error: nookError } = await admin
    .from("book_nooks")
    .select("id, scene")
    .eq("id", nookId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (nookError) throw nookError;
  if (!nook) return jsonError(404, "nook_not_found", "Nook not found.");

  let sources: Blob[];
  let mask: Blob | undefined;
  if (mode === "paint") {
    const src = roomSrc(nook.scene);
    if (!src || !isSafeStorageUrl(src)) {
      console.warn("generate-nook-part: no safe room picture — refusing rather than painting without one");
      return jsonError(400, "no_room_picture", "This nook has no room picture to paint against.");
    }
    const roomRes = await fetch(src);
    if (!roomRes.ok) {
      console.error("generate-nook-part: failed to fetch room picture", roomRes.status);
      return jsonError(502, "picture_fetch_failed", "The room picture could not be fetched. Please try again.");
    }
    sources = [await roomRes.blob()];
  } else {
    sources = [pngBlob(image_b64!)];
    if (mode === "fill") mask = pngBlob(mask_b64!);
  }

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
  if (mode === "fill" && img.provider !== "openai") return jsonError(503, "fill_unavailable", "Filling a gap is not available right now.");

  // One `entity_cutout` picture per call, at the shared size multiplier, so the price follows the admin's
  // re-pricing of cut-outs. Lift is two calls from the client (lift, then fill).
  const baseCost = await fetchCreditCost(admin, "entity_cutout");
  const cost = wholeCredits(
    applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(NOOK_PART_SIZE),
  );

  const quality = await resolveImageQuality(admin, "entity_cutout", img);

  return withCreditHold(admin, { payerId: user.id, reason: "entity_cutout", cost, report }, async (hold) => {
    let imgResult;
    try {
      imgResult = await generateImage({
        provider: img.provider, model: img.model, apiKey: img.apiKey,
        screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "entity_cutout" },
        prompt: nookPartPrompt(mode, subject), size: NOOK_PART_SIZE, quality, boostStyle: false,
        sourceImages: sources, mask,
        background: mode === "fill" ? "opaque" : "transparent",
      });
    } catch (e) {
      if (isPromptRejected(e)) return jsonError(400, "prompt_rejected", e.message);
      console.error("Nook part generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Nook part generation failed");
    }

    // The picture exists, so it is charged before the provenance mark below. If marking throws, the hold writes
    // this charge as a free line.
    hold.charge("entity_cutout", {
      cost, isByok: false,
      log: {
        model: img.model, quality, size: NOOK_PART_SIZE,
        provider: imgResult.usage.provider, image_count: 1,
        input_tokens:       imgResult.usage.input_tokens       || undefined,
        input_image_tokens: imgResult.usage.input_image_tokens || undefined,
        output_tokens:      imgResult.usage.output_tokens      || undefined,
      },
    });

    // EU AI Act Art 50(2): mark before the bytes leave this pipeline (the client uploads image_b64).
    const prov: AiProvenance = {
      generatorType: "nook_part",
      provider: imgResult.usage.provider,
      model: img.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };
    return json({ image_b64: markGeneratedImageB64(imgResult.b64, imgResult.contentType, prov) });
  });
}));
