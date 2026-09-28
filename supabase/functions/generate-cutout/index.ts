/**
 * Cutout generation (#917 story 5): make an entity's cutout FROM its existing
 * picture — an image *edit* of that picture, asking for the same figure on a
 * transparent background, so the cutout always matches the picture. OpenAI
 * only: Gemini has no `background` parameter (imageGen.ts), and a cutout's
 * whole point is a transparent background.
 *
 * PLATFORM KEYS ONLY, the same choice Simulacrum makes (SIMULACRUM_PLAN.md
 * §4, mirrored in forge-mini/index.ts) — a campaign's own OpenAI key is never
 * read here, so every call is charged (or refused for insufficient credits);
 * there is no BYOK discount to a cutout.
 *
 * Never trusts a client-supplied image URL: the source row is read back
 * server-side through a client scoped to the CALLER's own JWT, so RLS decides
 * whether the caller may read it at all. A row RLS allows through is not
 * necessarily this caller's to spend credits on, though — a player can read a
 * monster the DM revealed — so the ownership/campaign checks below are the
 * extra bar a readable row must still clear.
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
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { validateCutoutRequest, PICTURE_COLUMN, TABLE_HAS_CAMPAIGN_ID } from "./validateCutoutRequest.ts";

// Cutouts print beside the picture at the same portrait size (#917).
const CUTOUT_IMAGE_SIZE = "1024x1536";

const CUTOUT_PROMPT =
  "Keep the subject exactly as drawn: the same pose, colours, style, lighting and proportions, " +
  "the whole figure with nothing cropped. Remove everything else — scenery, floor, cast shadows, " +
  "text, borders and frames. The result must have a fully transparent background around the subject.";

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface SourceRow {
  id: string;
  user_id: string;
  campaign_id?: string | null;
  picture: string | null;
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  // RLS-scoped client for reading the source row — see the file doc for why
  // this, rather than the service-role `admin` client, does that read.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  // Frozen or child accounts cannot generate (#919) — including BYOK, which
  // skips the credit gate for both (see generationRefusal's own doc). This
  // feature has no BYOK path at all, but the check stays first regardless,
  // matching every other generator.
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_body", 400);
  }
  const validation = validateCutoutRequest(body);
  if (!validation.ok) return jsonError(validation.error, 400);
  const { campaign_id: campaignId, table, id } = validation.request;

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return jsonError("not_found", 404);
  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
    if (!membership) return jsonError("forbidden", 403);
  }
  if (campaign.ai_enabled !== true) return jsonError("ai_disabled", 403);

  const pictureColumn = PICTURE_COLUMN[table];
  const hasCampaignId = TABLE_HAS_CAMPAIGN_ID[table];
  const selectCols = hasCampaignId
    ? `id, user_id, campaign_id, picture:${pictureColumn}`
    : `id, user_id, picture:${pictureColumn}`;

  const { data: sourceRaw } = await supabase.from(table).select(selectCols).eq("id", id).maybeSingle();
  if (!sourceRaw) return jsonError("not_found", 404);
  const source = sourceRaw as unknown as SourceRow;
  // RLS already gated the read above; ownership is the extra bar a readable
  // row must still clear (a campaign member can read a DM's revealed
  // monster, but it isn't theirs to spend credits generating a cutout for).
  if (source.user_id !== user.id) return jsonError("forbidden", 403);
  if (hasCampaignId && source.campaign_id !== campaignId) return jsonError("not_found", 404);
  if (!source.picture) return jsonError("no_picture", 400);
  if (!isSafeStorageUrl(source.picture)) {
    console.warn("generate-cutout: rejected unsafe picture url — refusing rather than proceeding without a reference");
    return jsonError("no_picture", 400);
  }

  const pictureRes = await fetch(source.picture);
  if (!pictureRes.ok) {
    console.error("generate-cutout: failed to fetch source picture", pictureRes.status);
    return jsonError("picture_fetch_failed", 502);
  }
  const pictureBlob = await pictureRes.blob();

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai"]),
    fetchProviderConfigs(admin, ["openai"]),
  ]);
  const img = resolveImageProvider({
    imageProvider: "openai",
    campaignKeys: {}, // deliberately empty — no BYOK path for cutouts, see file doc
    platformKeys: { openai: platformKeys.openai },
    providerConfigs,
  });
  if (!img) return jsonError("no_image_provider", 422);

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = await fetchCreditCost(admin, "entity_cutout");
  const cost = wholeCredits(
    applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(CUTOUT_IMAGE_SIZE),
  );

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return jsonError("rate_limited", 429);
  }

  const reservation = await reserveCredits(admin, user.id, cost, "entity_cutout");
  if (!reservation.ok) return reservationFailureResponse(reservation);

  const quality = await resolveImageQuality(admin, "entity_cutout", img);

  let imgResult;
  try {
    imgResult = await generateImage({
      provider: img.provider, model: img.model, apiKey: img.apiKey,
      screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "entity_cutout" },
      prompt: CUTOUT_PROMPT, size: CUTOUT_IMAGE_SIZE, quality, boostStyle: false,
      sourceImages: [pictureBlob], background: "transparent",
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    // A prompt the screen refused is the DM's to reword, not a provider
    // outage — 400 rather than 502, and no error log for an ordinary refusal.
    if (isPromptRejected(e)) return jsonError(e.message, 400);
    console.error("Cutout generation failed:", e);
    return jsonError(e instanceof Error ? e.message : "Cutout generation failed", 502);
  }

  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "entity_cutout", false, cost, {
    model: img.model, quality, size: CUTOUT_IMAGE_SIZE,
    provider: imgResult.usage.provider, image_count: 1,
    input_tokens:       imgResult.usage.input_tokens       || undefined,
    input_image_tokens: imgResult.usage.input_image_tokens || undefined,
    output_tokens:      imgResult.usage.output_tokens      || undefined,
  });

  // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. This
  // endpoint has no server-side upload (the client uploads image_b64), so the
  // response is the last point the resolved provider/model are known.
  const prov: AiProvenance = {
    generatorType: table === "monsters" ? "monster_cutout" : "npc_cutout",
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
