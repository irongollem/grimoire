import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchCreditCost, recordGeneration, releaseCredits, reserveCredits, reservationFailureResponse, sizeMultiplier } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { createImageJob, completeImageJob, failImageJob, type ImageJobKind } from "../_shared/imageJob.ts";
import { buildLabelledImagePrompt, buildSimpleImagePrompt } from "../_shared/image-prompt.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";
import { generateImage, resolveImageProvider, type ImageProviderKey } from "../_shared/imageGen.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { uploadWithRetry } from "../_shared/storage-upload.ts";
import { markGeneratedImage } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";

// Keep browser-supplied composition inputs bounded before req.json()/atob hold
// both the encoded and decoded copies in the Edge isolate.
const MAX_SOURCE_IMAGE_B64_CHARS = 12_000_000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type ImagePurpose =
  | "chronicler" | "group_portrait" | "npc_portrait" | "npc_disguise"
  | "monster" | "item" | "spell" | "faction" | "location" | "location_map"
  | "trap" | "puzzle" | "party_member" | "species" | "map_style";

const PURPOSE_CONFIG: Record<ImagePurpose, {
  kind: ImageJobKind;
  bucket: string;
  prefix: string;
  creditType: "chronicle_image" | "entity_image" | "map_style_generation";
  boostStyle: boolean;
}> = {
  chronicler:     { kind: "chronicler",     bucket: "chronicle",       prefix: "scene",    creditType: "chronicle_image",    boostStyle: true },
  group_portrait: { kind: "group_portrait", bucket: "chronicle",       prefix: "group",    creditType: "chronicle_image",    boostStyle: true },
  npc_portrait:   { kind: "npc_portrait",   bucket: "npc-portraits",   prefix: "npc",      creditType: "entity_image",       boostStyle: true },
  npc_disguise:   { kind: "npc_disguise",   bucket: "npc-portraits",   prefix: "disguise", creditType: "entity_image",       boostStyle: true },
  monster:        { kind: "monster",        bucket: "monster-images",  prefix: "monster",  creditType: "entity_image",       boostStyle: true },
  item:           { kind: "item",           bucket: "item-images",     prefix: "item",     creditType: "entity_image",       boostStyle: true },
  spell:          { kind: "spell",          bucket: "spell-images",    prefix: "spell",    creditType: "entity_image",       boostStyle: true },
  faction:        { kind: "faction",        bucket: "faction-images",  prefix: "faction",  creditType: "entity_image",       boostStyle: true },
  location:       { kind: "location",       bucket: "location-images", prefix: "location", creditType: "entity_image",       boostStyle: true },
  location_map:   { kind: "location_map",   bucket: "location-images", prefix: "map",      creditType: "entity_image",       boostStyle: false },
  trap:           { kind: "trap",           bucket: "trap-images",     prefix: "trap",     creditType: "entity_image",       boostStyle: true },
  puzzle:         { kind: "puzzle",         bucket: "puzzle-images",   prefix: "puzzle",   creditType: "entity_image",       boostStyle: true },
  party_member:   { kind: "party_member",   bucket: "chronicle",       prefix: "party",    creditType: "entity_image",       boostStyle: true },
  species:        { kind: "species",        bucket: "asset-images",    prefix: "species",  creditType: "entity_image",       boostStyle: true },
  map_style:      { kind: "map_style",      bucket: "location-images", prefix: "styled",   creditType: "map_style_generation", boostStyle: false },
};

function buildScenePrompt(sceneText: string, textDescriptions: string[], settingPrompt: string, imageBasePrompt: string): string {
  const parts = [imageBasePrompt];
  if (settingPrompt.trim()) parts.push(settingPrompt.trim());
  parts.push("\n\nCompose a scene illustration.");
  if (textDescriptions.length > 0) {
    parts.push(
      "The following characters appear — use the provided reference portraits where available, and the written descriptions for those without one:\n" +
      textDescriptions.map((d) => `• ${d}`).join("\n"),
    );
    parts.push(
      "Character rules:\n" +
      "• Render each character exactly once. If a character belongs to a group or party reference and is also named individually, depict them a single time only — never duplicate the same character in the scene unless specifically asked.\n" +
      "• Reference portraits — including any group or party portrait — define each character's face, build, and costume ONLY. Do not copy their poses, expressions, framing, or the reference's composition. Re-pose and re-stage every character naturally for this specific scene and its action.",
    );
  }
  parts.push(`\nScene: ${sceneText}`);
  return parts.join("\n");
}

function buildPurposePrompt(
  purpose: ImagePurpose,
  subject: string,
  textDescriptions: string[],
  settingPrompt: string,
  imageBasePrompt: string,
): string {
  if (purpose === "chronicler" || purpose === "group_portrait") {
    return buildScenePrompt(subject, textDescriptions, settingPrompt, imageBasePrompt);
  }
  if (purpose === "npc_portrait") {
    return buildLabelledImagePrompt({ base: imageBasePrompt, setting: settingPrompt, subject });
  }
  if (purpose === "location_map" || purpose === "map_style") return subject;
  return buildSimpleImagePrompt({ base: imageBasePrompt, setting: settingPrompt, subject });
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
  const { data } = admin.storage.from(config.bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function runGeneration(args: {
  jobId: string;
  userId: string;
  provider: ImageProviderKey;
  model: string;
  apiKey: string;
  prompt: string;
  size: string;
  quality: string | null;
  portrait_urls: string[];
  isByok: boolean;
  cost: number;
  reservationIds: string[];
  purpose: ImagePurpose;
  source_image_b64: string | null;
}) {
  const { jobId, userId, provider, model, apiKey, prompt, size, quality, portrait_urls, isByok, cost, reservationIds, purpose, source_image_b64 } = args;

  try {
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

    const { b64, contentType, usage } = await generateImage({
      provider, model, apiKey, prompt, size, quality, boostStyle: PURPOSE_CONFIG[purpose].boostStyle,
      sourceImages: portraitBlobs.length > 0 ? portraitBlobs : undefined,
    });

    // provider/model here mirror what recordGeneration logs below: usage.provider
    // is the actual responding provider (openai-mini resolves to "openai"),
    // model is the resolved model this call was made with.
    const imageUrl = await uploadResult(b64, contentType, userId, purpose, usage.provider, model);
    await completeImageJob(admin, jobId, imageUrl);

    // Release the hold and record the real spend (one cost row, with analytics).
    await releaseCredits(admin, reservationIds);
    await recordGeneration(admin, userId, PURPOSE_CONFIG[purpose].creditType, isByok, cost, {
      model,
      provider: usage.provider,
      image_count: 1,
      input_tokens: usage.input_tokens,
      input_image_tokens: usage.input_image_tokens || undefined,
      output_tokens: usage.output_tokens || undefined,
    }).catch(console.error);
  } catch (e) {
    await releaseCredits(admin, reservationIds);
    console.error("Chronicle image generation failed:", e);
    await failImageJob(admin, jobId, e instanceof Error ? e.message : "Image generation failed");
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(withCors(async (req: Request) => {
  const text = (msg: string, status: number) => new Response(msg, { status });

  if (req.method !== "POST") return text("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return text("Unauthorized", 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return text("Unauthorized", 401);

  // Frozen accounts cannot generate — including BYOK, which skips the credit gate.
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();

  let campaign_id: string, subject: string, portrait_urls: string[],
      text_descriptions: string[], size: string, image_model: string,
      purpose: ImagePurpose, source_image_b64: string | null;

  try {
    const body = await req.json();
    campaign_id       = body.campaign_id;
    // `scene_text` remains accepted for existing Chronicler callers.
    subject           = body.subject ?? body.scene_text;
    portrait_urls     = Array.isArray(body.portrait_urls) ? body.portrait_urls : [];
    text_descriptions = Array.isArray(body.text_descriptions) ? body.text_descriptions : [];
    size              = body.size ?? "1024x1024";
    image_model       = body.image_model ?? "gpt-image-2";
    purpose           = (body.purpose as ImagePurpose | undefined)
      ?? ((body.kind as string | undefined) === "group_portrait" ? "group_portrait" : "chronicler");
    source_image_b64  = typeof body.source_image_b64 === "string" ? body.source_image_b64 : null;
    if (!campaign_id || !subject || !(purpose in PURPOSE_CONFIG)) throw new Error("invalid");
  } catch {
    return text("Invalid body — need { campaign_id, purpose, subject }", 400);
  }
  if (source_image_b64 && source_image_b64.length > MAX_SOURCE_IMAGE_B64_CHARS) {
    return text("Source image too large", 413);
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, ai_setting_prompt, image_provider, openai_api_key, gemini_api_key, falai_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return text("Campaign not found", 404);
  if (campaign.ai_enabled === false) return text("AI is disabled for this campaign", 403);

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return text("Forbidden", 403);
  }

  // BYOK is Pro-only: ignore stored campaign keys unless the owner is currently Pro.
  const ownerIsPro = await isUserPro(admin, campaign.user_id);
  const decryptKey = (enc: string | null) => (enc && ownerIsPro) ? decryptValue(enc).catch(() => null) : Promise.resolve(null);
  const [[campaignOpenai, campaignGemini, campaignFalai], platformKeys, providerConfigs] = await Promise.all([
    Promise.all([decryptKey(campaign.openai_api_key), decryptKey(campaign.gemini_api_key), decryptKey(campaign.falai_api_key)]),
    fetchPlatformKeys(admin, ["openai", "gemini", "falai"]),
    fetchProviderConfigs(admin, ["openai", "gemini", "falai"]),
  ]);
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    campaignKeys: { openai: campaignOpenai, falai: campaignFalai, gemini: campaignGemini },
    platformKeys: { openai: platformKeys.openai, falai: platformKeys.falai, gemini: platformKeys.gemini },
    providerConfigs,
    requestedModel: image_model,
  });
  if (!img) return text("No image API key configured", 422);
  const isByok = img.isByok;
  const model = img.model;

  // Pre-flight credit check (deduction happens after generation, in the bg task).
  // Cost scales with output area (landscape/portrait = 1.5×) and the provider's multiplier.
  const config = PURPOSE_CONFIG[purpose];
  const imageCost = isByok
    ? 0
    : Math.round(await fetchCreditCost(admin, config.creditType) * sizeMultiplier(size) * img.imageMultiplier * 100) / 100;
  // Atomic affordability gate: hold the balance now; the background task releases
  // it and records the real spend (or releases on failure).
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, imageCost, config.creditType);
  if (!reservation.ok) {
    return reservationFailureResponse(reservation);
  }

  const settingPrompt = campaign.ai_setting_prompt ?? "";
  const { data: imageBaseRow } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "image_base").maybeSingle();
  const imageBasePrompt = imageBaseRow?.content ?? "";
  const prompt = buildPurposePrompt(purpose, subject, text_descriptions, settingPrompt, imageBasePrompt);

  // Insert pending job — client polls/subscribes by id
  const jobId = await createImageJob(admin, {
    user_id: user.id,
    campaign_id,
    kind: config.kind,
    prompt: subject.slice(0, 500),
    size,
    model,
    provider: img.provider,
  });

  // Background-task pattern: return job_id immediately, OpenAI call continues
  // past response. Deno Deploy's EdgeRuntime keeps the isolate alive for waitUntil.
  // @ts-ignore — EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
  EdgeRuntime.waitUntil(runGeneration({
    jobId, userId: user.id, provider: img.provider, model, apiKey: img.apiKey,
    prompt, size, quality: img.imageQuality, portrait_urls, isByok, cost: imageCost,
    reservationIds: reservation.ids, purpose, source_image_b64,
  }));

  return new Response(
    JSON.stringify({ job_id: jobId }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
