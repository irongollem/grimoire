import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { createImageJob, completeImageJob, failImageJob, type ImageJobKind } from "../_shared/imageJob.ts";
import { buildEntityImagePrompt, imageBoostFor } from "../_shared/image-prompt.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";
import { generateImage, resolveImageProvider, type ImageProviderKey } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { settleHandedOff, withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { uploadWithRetry, publicUrlFor } from "../_shared/storage-upload.ts";
import { markGeneratedImage } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { registerImageProvenance } from "../_shared/provenance/register.ts";
import { hasLikenessAcknowledgement } from "../_shared/provenance/likeness-gate.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldImageSetting } from "../_shared/worldBlock.ts";
import { lookReferenceBlobs } from "../_shared/lookReferenceBlobs.ts";

// Keep browser-supplied composition inputs bounded before req.json()/atob hold
// both the encoded and decoded copies in the Edge isolate.
const MAX_SOURCE_IMAGE_B64_CHARS = 12_000_000;

// The picture sizes the app asks for. The size is the client's to name and prices the hold (`sizeMultiplier`), so an
// arbitrary "WxH" string would price an image the provider may still render at its own size.
const ALLOWED_SIZES: readonly string[] = ["1024x1024", "1024x1536", "1536x1024", "512x512"];

interface ChronicleCampaign extends BaseCampaign {
  image_provider: string | null;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type ImagePurpose =
  | "chronicler" | "group_portrait" | "npc_portrait" | "npc_disguise"
  | "monster" | "item" | "spell" | "faction" | "location" | "location_map"
  | "trap" | "puzzle" | "party_member" | "species" | "dungeon_feature" | "deity";

// takesLook: a map is top-down cartography, so the look's pictures would paint it as a scene. `deity` and
// `dungeon_feature` take the look's style on purpose: an emblem and a feature are painted in the campaign's hand.
const PURPOSE_CONFIG: Record<ImagePurpose, {
  kind: ImageJobKind;
  bucket: string;
  prefix: string;
  creditType: "chronicle_image" | "entity_image" | "map_style_generation";
  boostStyle: boolean;
  /** Whether the campaign Look's style pictures go to the image model beside the written look (#1252). */
  takesLook: boolean;
}> = {
  chronicler:     { kind: "chronicler",     bucket: "chronicle",       prefix: "scene",    creditType: "chronicle_image",    boostStyle: true, takesLook: true },
  group_portrait: { kind: "group_portrait", bucket: "chronicle",       prefix: "group",    creditType: "chronicle_image",    boostStyle: true, takesLook: true },
  npc_portrait:   { kind: "npc_portrait",   bucket: "npc-portraits",   prefix: "npc",      creditType: "entity_image",       boostStyle: true, takesLook: true },
  npc_disguise:   { kind: "npc_disguise",   bucket: "npc-portraits",   prefix: "disguise", creditType: "entity_image",       boostStyle: true, takesLook: true },
  monster:        { kind: "monster",        bucket: "monster-images",  prefix: "monster",  creditType: "entity_image",       boostStyle: true, takesLook: true },
  item:           { kind: "item",           bucket: "item-images",     prefix: "item",     creditType: "entity_image",       boostStyle: true, takesLook: true },
  spell:          { kind: "spell",          bucket: "spell-images",    prefix: "spell",    creditType: "entity_image",       boostStyle: true, takesLook: true },
  faction:        { kind: "faction",        bucket: "faction-images",  prefix: "faction",  creditType: "entity_image",       boostStyle: true, takesLook: true },
  location:       { kind: "location",       bucket: "location-images", prefix: "location", creditType: "entity_image",       boostStyle: true, takesLook: true },
  location_map:   { kind: "location_map",   bucket: "location-images", prefix: "map",      creditType: "entity_image",       boostStyle: false, takesLook: false },
  trap:           { kind: "trap",           bucket: "trap-images",     prefix: "trap",     creditType: "entity_image",       boostStyle: true, takesLook: true },
  puzzle:         { kind: "puzzle",         bucket: "puzzle-images",   prefix: "puzzle",   creditType: "entity_image",       boostStyle: true, takesLook: true },
  party_member:   { kind: "party_member",   bucket: "chronicle",       prefix: "party",    creditType: "entity_image",       boostStyle: true, takesLook: true },
  species:        { kind: "species",        bucket: "species-images",  prefix: "species",  creditType: "entity_image",       boostStyle: true, takesLook: true },
  dungeon_feature: { kind: "dungeon_feature", bucket: "dungeon-feature-images", prefix: "feature", creditType: "entity_image", boostStyle: true, takesLook: true },
  deity:          { kind: "deity",          bucket: "pantheon-emblems", prefix: "deity",   creditType: "entity_image",       boostStyle: true, takesLook: true },
};

function buildScenePrompt(sceneText: string, textDescriptions: string[], setting: string, imageBasePrompt: string): string {
  const parts = [imageBasePrompt];
  if (setting.trim()) parts.push(setting.trim());
  parts.push("\n\nCompose a scene illustration.");
  if (textDescriptions.length > 0) {
    parts.push(
      "The following characters, creatures and factions appear — use the provided reference images where available, and the written descriptions for those without one:\n" +
      textDescriptions.map((d) => `• ${d}`).join("\n"),
    );
    parts.push(
      "Character rules:\n" +
      "• Render each character exactly once. If a character belongs to a group or party reference and is also named individually, depict them a single time only — never duplicate the same character in the scene unless specifically asked.\n" +
      "• Reference portraits — including any group or party portrait — define each character's face, build, and costume ONLY. Do not copy their poses, expressions, framing, or the reference's composition. Re-pose and re-stage every character naturally for this specific scene and its action.\n" +
      "• A faction's reference image is its emblem, not a portrait. Render it as heraldry — on a banner, shield, tabard, or insignia carried or worn by the people in the scene — never as a character or creature in its own right.",
    );
  }
  parts.push(`\nScene: ${sceneText}`);
  return parts.join("\n");
}

function buildPurposePrompt(
  purpose: ImagePurpose,
  subject: string,
  textDescriptions: string[],
  setting: string,
  imageBasePrompt: string,
): string {
  if (purpose === "chronicler" || purpose === "group_portrait") {
    return buildScenePrompt(subject, textDescriptions, setting, imageBasePrompt);
  }
  if (purpose === "location_map") return subject;
  return buildEntityImagePrompt(purpose, { base: imageBasePrompt, setting, subject });
}

async function uploadResult(
  b64: string,
  contentType: string,
  userId: string,
  purpose: ImagePurpose,
  provider: string,
  model: string,
): Promise<string> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const config = PURPOSE_CONFIG[purpose];
  const path = `${userId}/${config.prefix}-${crypto.randomUUID()}.webp`;
  // EU AI Act Art 50(2) — mark before upload, using the provider's true byte
  // format (contentType), not the ".webp" this pipeline requests but doesn't
  // always get back (see imageGen.ts's ImageGenResult.contentType).
  const prov: AiProvenance = { generatorType: purpose, provider, model, generatedAt: new Date().toISOString(), edited: false };
  const marked = markGeneratedImage(bin, contentType, prov);
  // The generated image is already in memory and re-running the OpenAI call
  // is expensive, so uploadWithRetry's backoff protects a transient storage
  // hiccup from wasting the generation. This caller wants the public URL.
  await uploadWithRetry(admin, config.bucket, path, marked, "image/webp");
  // The registry is how the UI finds this image's provenance. A failure here
  // must not waste a paid generation whose bytes are already stored: the mark
  // inside the file is the disclosure of record, and the backfill scan repairs
  // a missed row.
  try {
    await registerImageProvenance(admin, config.bucket, path, userId, prov);
  } catch (err) {
    console.error(`image_provenance registration failed for ${config.bucket}/${path}`, err);
  }
  // Must agree with the browser client's getPublicUrl (#577): every bucket above
  // is CDN-fronted, so persisting an origin URL here would leave every
  // server-generated image permanently off the CDN, even after the one-time
  // rewrite of existing rows.
  return publicUrlFor(admin, config.bucket, path);
}

async function runGeneration(args: {
  jobId: string;
  userId: string;
  provider: ImageProviderKey;
  model: string;
  apiKey: string;
  moderationKey: string | null;
  prompt: string;
  size: string;
  quality: string | null;
  portrait_urls: string[];
  /** The look's style pictures (#1252), empty for a map. */
  look_reference_urls: string[];
  isByok: boolean;
  cost: number;
  reservationIds: string[];
  purpose: ImagePurpose;
  source_image_b64: string | null;
  report: (err: unknown) => void;
}) {
  const { jobId, userId, provider, model, apiKey, moderationKey, prompt, size, quality, portrait_urls, look_reference_urls, isByok, cost, reservationIds, purpose, source_image_b64, report } = args;

  // Once the picture is stored it is charged, and nothing after that may call the job failed (the hand-wired worker
  // marked a delivered image failed when completeImageJob or the release threw, #1234).
  const stored: { url: string | null } = { url: null };
  try {
    await settleHandedOff(admin, { payerId: userId, ids: reservationIds, report }, async (ledger) => {
      // Fetch reference portrait blobs in parallel (openai + gemini compose them).
      const portraitBlobs: Blob[] = [];
      // SSRF guard: only ever fetch our own Supabase Storage public URLs. Unsafe
      // URLs are skipped (mirrors the existing "skip non-ok fetches" behavior).
      const safeUrls = portrait_urls.filter((url) => {
        if (isSafeStorageUrl(url)) return true;
        console.warn("Rejected unsafe portrait_url — skipping");
        return false;
      });
      if (safeUrls.length > 0) {
        const results = await Promise.allSettled(
          safeUrls.map((url) => fetch(url).then((r) => r.ok ? r.blob() : null)),
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) portraitBlobs.push(r.value);
        }
      }
      if (source_image_b64) {
        const bytes = Uint8Array.from(atob(source_image_b64), (c) => c.charCodeAt(0));
        portraitBlobs.push(new Blob([bytes], { type: "image/png" }));
      }

      const styleReferences = await lookReferenceBlobs(look_reference_urls);
      const { b64, contentType, usage } = await generateImage({
        provider, model, apiKey, prompt, size, quality, boostStyle: PURPOSE_CONFIG[purpose].boostStyle && imageBoostFor(purpose),
        screening: { apiKey: moderationKey, admin, userId, generationType: purpose },
        sourceImages: portraitBlobs.length > 0 ? portraitBlobs : undefined,
        styleReferences,
      });

      // provider/model here mirror what the ledger logs: usage.provider is the actual responding provider, model is
      // the resolved model this call was made with.
      stored.url = await uploadResult(b64, contentType, userId, purpose, usage.provider, model);
      ledger.charge(PURPOSE_CONFIG[purpose].creditType, {
        cost, isByok,
        log: {
          model,
          quality,
          size,
          provider: usage.provider,
          image_count: 1,
          input_tokens: usage.input_tokens,
          input_image_tokens: usage.input_image_tokens || undefined,
          output_tokens: usage.output_tokens || undefined,
        },
      });
    });
  } catch (e) {
    if (stored.url === null) {
      console.error("Chronicle image generation failed:", e);
      try {
        await failImageJob(admin, jobId, e instanceof Error ? e.message : "Image generation failed");
      } catch (failErr) {
        console.error("generate-chronicle-image: could not mark the job failed", failErr);
        report(failErr);
      }
      return;
    }
    console.error("generate-chronicle-image: settling after a stored image failed", e);
    report(e);
  }
  if (stored.url !== null) await finishJob(stored.url);

  // Job bookkeeping sits outside the settlement: a stored, charged image is never "failed".
  async function finishJob(url: string) {
    try {
      await completeImageJob(admin, jobId, url);
    } catch (e) {
      console.error("generate-chronicle-image: completeImageJob failed after the image was stored", e);
      report(e);
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate — including BYOK, which skips
  // the credit gate for both (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const invalid = () => jsonError(400, "invalid_body", "Send { campaign_id, purpose, subject } to draw a picture.");
  if (!body) return invalid();
  // `scene_text` remains accepted for existing Chronicler callers.
  const subject = body.subject ?? body.scene_text;
  const rawPurpose = body.purpose ?? (body.kind === "group_portrait" ? "group_portrait" : "chronicler");
  const campaign_id = body.campaign_id;
  if (typeof campaign_id !== "string" || !campaign_id || typeof subject !== "string" || !subject) return invalid();
  if (typeof rawPurpose !== "string" || !Object.hasOwn(PURPOSE_CONFIG, rawPurpose)) return invalid();
  const purpose = rawPurpose as ImagePurpose;
  const size = body.size ?? "1024x1024";
  if (typeof size !== "string" || !ALLOWED_SIZES.includes(size)) {
    return jsonError(400, "invalid_size", "That picture size is not available.");
  }
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const portrait_urls = strings(body.portrait_urls);
  const text_descriptions = strings(body.text_descriptions);
  const source_image_b64 = typeof body.source_image_b64 === "string" ? body.source_image_b64 : null;
  const note_id = typeof body.note_id === "string" && body.note_id ? body.note_id : null;
  if (source_image_b64 && source_image_b64.length > MAX_SOURCE_IMAGE_B64_CHARS) {
    return jsonError(413, "source_image_too_large", "That source image is too large.");
  }

  // EU AI Act Art 50(1) likeness backstop — gated on the REQUEST SHAPE (any
  // portrait_urls supplied), not the purpose: this one endpoint serves
  // chronicler scenes, group portraits, NPC disguise and trap scenes alike,
  // all of which pass portrait_urls when they carry a reference; purposes
  // that never do (species, a chronicler scene with no @mentions,
  // ...) naturally skip this. Cheap, early, before any credit reservation.
  // Client pre-flights the identical check via useLikenessGate — this rarely
  // actually fires. See context/compliance/provenance-architecture.md §3.
  if (portrait_urls.length > 0 && !(await hasLikenessAcknowledgement(admin, user.id))) {
    return jsonError(403, "likeness_acknowledgement_required", "Confirm the likeness notice first, then try again.");
  }

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits or the owner's own provider key (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<ChronicleCampaign>(admin, campaign_id, user.id, { columns: ["image_provider"] });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  const [[campaignOpenai, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "gemini"]),
  ]);
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    campaignKeys: { openai: campaignOpenai, gemini: campaignGemini },
    platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
    providerConfigs,
    // Scenes and group portraits follow Admin → Providers' Chronicler model;
    // the entity purposes this function also renders follow the image model.
    surface: PURPOSE_CONFIG[purpose].creditType === "chronicle_image" ? "chronicle" : undefined,
  });
  if (!img) return jsonError(422, "no_image_provider", "No image API key is configured.");
  const isByok = img.isByok;
  const model = img.model;

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // Everything that can throw is read before the hold is taken.
  // Cost scales with output area (landscape/portrait = 1.5×) and the provider's multiplier.
  const config = PURPOSE_CONFIG[purpose];
  const imageCost = isByok
    ? 0
    : wholeCredits(await fetchCreditCost(admin, config.creditType) * sizeMultiplier(size) * img.imageMultiplier);
  const quality = await resolveImageQuality(admin, config.creditType, img);

  const world = await loadWorldBlock(admin, campaign.id);
  const setting = worldImageSetting(world);
  const lookReferenceUrls = config.takesLook ? world.lookReferences : [];

  const { data: imageBaseRow, error: imageBaseError } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "image_base").maybeSingle();
  if (imageBaseError) throw imageBaseError;
  const imageBasePrompt = imageBaseRow?.content ?? "";
  const prompt = buildPurposePrompt(purpose, subject, text_descriptions, setting, imageBasePrompt);

  // A chronicler job started from a saved note records the note as its
  // completion target: completeImageJob then swaps the note's pendingImage
  // anchor for the finished image server-side (#614), so shared-note viewers
  // see it without waiting for the DM's next edit + save. The note must be
  // the CALLER'S own note in THIS campaign — note_id is client-supplied and
  // the completion rewrite runs with the service role, so a forged id must
  // die here (dropped, not rejected: a stale id — note deleted since the
  // editor opened — shouldn't block a generation the gallery still wants).
  let noteTarget: { target_table: string; target_id: string; target_column: string } | null = null;
  if (note_id && purpose === "chronicler") {
    const { data: note, error: noteError } = await admin
      .from("notes")
      .select("id")
      .eq("id", note_id)
      .eq("user_id", user.id)
      .eq("campaign_id", campaign_id)
      .maybeSingle();
    if (noteError) throw noteError;
    if (note) {
      noteTarget = { target_table: "notes", target_id: note_id, target_column: "content" };
    } else {
      console.warn(`generate-chronicle-image: dropping note_id ${note_id} — not caller's note in this campaign`);
    }
  }

  // Atomic affordability gate: hold the balance now; the background job settles it
  // (charges the real spend, or releases on failure).
  return withCreditHold(admin, { payerId: user.id, reason: config.creditType, cost: imageCost, report }, async (hold) => {
    // Insert pending job — client polls/subscribes by id
    let jobId: string;
    try {
      jobId = await createImageJob(admin, {
        user_id: user.id,
        campaign_id,
        kind: config.kind,
        prompt: subject.slice(0, 500),
        size,
        model,
        provider: img.provider,
        ...noteTarget,
      });
    } catch (e) {
      console.error("generate-chronicle-image: createImageJob failed", e);
      return jsonError(500, "job_create_failed", "The picture could not be started. Please try again.");
    }

    // Background-task pattern: return job_id immediately, OpenAI call continues
    // past response. Deno Deploy's EdgeRuntime keeps the isolate alive for waitUntil.
    const run = runGeneration({
      jobId, userId: user.id, provider: img.provider, model, apiKey: img.apiKey, moderationKey: img.moderationKey,
      prompt, size, quality, portrait_urls, look_reference_urls: lookReferenceUrls, isByok, cost: imageCost,
      reservationIds: hold.handOff(), purpose, source_image_b64, report,
    });
    try {
      // @ts-ignore — EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
      EdgeRuntime.waitUntil(run);
    } catch (e) {
      // The worker is already running; only the keep-alive failed.
      console.error("generate-chronicle-image: waitUntil failed", e);
      report(e);
    }
    return json({ job_id: jobId });
  });
}));
