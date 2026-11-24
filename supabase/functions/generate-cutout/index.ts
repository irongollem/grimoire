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
 * there is no discount on a cutout.
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
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { validateCutoutRequest, PICTURE_COLUMN, TABLE_HAS_CAMPAIGN_ID } from "./validateCutoutRequest.ts";

// Cutouts print beside the picture at the same portrait size (#917).
const CUTOUT_IMAGE_SIZE = "1024x1536";

const CUTOUT_PROMPT =
  "Keep the subject exactly as drawn: the same pose, colours, style, lighting and proportions, " +
  "the whole figure with nothing cropped. Remove everything else — scenery, floor, cast shadows, " +
  "text, borders and frames. The result must have a fully transparent background around the subject.";

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

serve(serveUser(async ({ user, req, userClient, report }) => {
  // Frozen or child accounts cannot generate (#919). The check stays first,
  // matching every other generator.
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  if (!body) return jsonError(400, "invalid_body", "Need { campaign_id, table, id }.");
  const validation = validateCutoutRequest(body);
  if (!validation.ok) return jsonError(400, validation.error, "Need { campaign_id, table, id } for a monster or NPC.");
  const { campaign_id: campaignId, table, id } = validation.request;

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign(admin, campaignId, user.id);
  if (!load.ok) return load.response;

  const pictureColumn = PICTURE_COLUMN[table];
  const hasCampaignId = TABLE_HAS_CAMPAIGN_ID[table];
  const selectCols = hasCampaignId
    ? `id, user_id, campaign_id, picture:${pictureColumn}`
    : `id, user_id, picture:${pictureColumn}`;

  // RLS-scoped client for reading the source row — see the file doc for why
  // this, rather than the service-role `admin` client, does that read.
  const { data: sourceRaw, error: sourceError } = await userClient.from(table).select(selectCols).eq("id", id).maybeSingle();
  if (sourceError) throw sourceError;
  if (!sourceRaw) return jsonError(404, "not_found", "That picture could not be found.");
  const source = sourceRaw as unknown as SourceRow;
  // RLS already gated the read above; ownership is the extra bar a readable
  // row must still clear (a campaign member can read a DM's revealed
  // monster, but it isn't theirs to spend credits generating a cutout for).
  if (source.user_id !== user.id) return jsonError(403, "forbidden", "Only the owner of this entry can make its cutout.");
  if (hasCampaignId && source.campaign_id !== campaignId) return jsonError(404, "not_found", "That picture could not be found.");
  if (!source.picture) return jsonError(400, "no_picture", "This entry has no picture to cut out.");
  if (!isSafeStorageUrl(source.picture)) {
    console.warn("generate-cutout: rejected unsafe picture url — refusing rather than proceeding without a reference");
    return jsonError(400, "no_picture", "This entry has no picture to cut out.");
  }

  const pictureRes = await fetch(source.picture);
  if (!pictureRes.ok) {
    console.error("generate-cutout: failed to fetch source picture", pictureRes.status);
    return jsonError(502, "picture_fetch_failed", "The picture could not be fetched. Please try again.");
  }
  const pictureBlob = await pictureRes.blob();

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai"]),
    fetchProviderConfigs(admin, ["openai"]),
  ]);
  const img = resolveImageProvider({
    imageProvider: "openai",
    pinned: true, // transparent output is OpenAI-only: a capability, not the campaign's Quick/Detailed choice
    platformKeys: { openai: platformKeys.openai },
    providerConfigs,
  });
  if (!img) return jsonError(422, "no_image_provider", "No image provider is configured.");

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // ── Everything that can be read is read before the hold ───────────────────
  const baseCost = await fetchCreditCost(admin, "entity_cutout");
  const cost = wholeCredits(
    applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(CUTOUT_IMAGE_SIZE),
  );
  const quality = await resolveImageQuality(admin, "entity_cutout", img);

  return withCreditHold(admin, { payerId: user.id, reason: "entity_cutout", cost, report }, async (hold) => {
    let imgResult;
    try {
      imgResult = await generateImage({
        provider: img.provider, model: img.model, apiKey: img.apiKey,
        screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "entity_cutout" },
        prompt: CUTOUT_PROMPT, size: CUTOUT_IMAGE_SIZE, quality, boostStyle: false,
        sourceImages: [pictureBlob], background: "transparent",
      });
    } catch (e) {
      // A prompt the screen refused is the DM's to reword, not a provider
      // outage — 400 rather than 502, and no error log for an ordinary refusal.
      if (isPromptRejected(e)) return jsonError(400, "prompt_rejected", e.message);
      console.error("Cutout generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Cutout generation failed");
    }

    // The picture exists, so it is charged before the provenance mark below. If marking throws, the hold writes
    // this charge as a free line.
    hold.charge("entity_cutout", {
      cost,
      log: {
        model: img.model, quality, size: CUTOUT_IMAGE_SIZE,
        provider: imgResult.usage.provider, image_count: 1,
        input_tokens:       imgResult.usage.input_tokens       || undefined,
        input_image_tokens: imgResult.usage.input_image_tokens || undefined,
        output_tokens:      imgResult.usage.output_tokens      || undefined,
      },
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
    return json({ image_b64: markGeneratedImageB64(imgResult.b64, imgResult.contentType, prov) });
  });
}));
