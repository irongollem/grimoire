import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchCreditCost, recordGeneration, releaseCredits, reserveCredits, reservationFailureResponse, sizeMultiplier } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { createImageJob, completeImageJob, failImageJob, type ImageJobKind } from "../_shared/imageJob.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";
import { generateImage, resolveImageProvider, type ImageProviderKey } from "../_shared/imageGen.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { uploadWithRetry } from "../_shared/storage-upload.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function buildPrompt(sceneText: string, textDescriptions: string[], settingPrompt: string, imageBasePrompt: string): string {
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

async function uploadResult(b64: string, userId: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const path = `${userId}/scene-${crypto.randomUUID()}.webp`;
  // The generated image is already in memory and re-running the OpenAI call
  // is expensive, so uploadWithRetry's backoff protects a transient storage
  // hiccup from wasting the generation. This caller wants the public URL.
  await uploadWithRetry(admin, "chronicle", path, bin, "image/webp");
  const { data } = admin.storage.from("chronicle").getPublicUrl(path);
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
}) {
  const { jobId, userId, provider, model, apiKey, prompt, size, quality, portrait_urls, isByok, cost, reservationIds } = args;

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

    const { b64, usage } = await generateImage({
      provider, model, apiKey, prompt, size, quality, boostStyle: true,
      sourceImages: portraitBlobs.length > 0 ? portraitBlobs : undefined,
    });

    const imageUrl = await uploadResult(b64, userId);
    await completeImageJob(admin, jobId, imageUrl);

    // Release the hold and record the real spend (one cost row, with analytics).
    await releaseCredits(admin, reservationIds);
    await recordGeneration(admin, userId, "chronicle_image", isByok, cost, {
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

  let campaign_id: string, scene_text: string, portrait_urls: string[],
      text_descriptions: string[], size: string, image_model: string, kind: ImageJobKind;

  try {
    const body = await req.json();
    campaign_id       = body.campaign_id;
    scene_text        = body.scene_text;
    portrait_urls     = Array.isArray(body.portrait_urls) ? body.portrait_urls : [];
    text_descriptions = Array.isArray(body.text_descriptions) ? body.text_descriptions : [];
    size              = body.size ?? "1024x1024";
    image_model       = body.image_model ?? "gpt-image-2";
    kind              = (body.kind as ImageJobKind | undefined) ?? "chronicler";
    if (!campaign_id || !scene_text) throw new Error("invalid");
  } catch {
    return text("Invalid body — need { campaign_id, scene_text }", 400);
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
  const chronicleImageCost = isByok
    ? 0
    : Math.round(await fetchCreditCost(admin, "chronicle_image") * sizeMultiplier(size) * img.imageMultiplier * 100) / 100;
  // Atomic affordability gate: hold the balance now; the background task releases
  // it and records the real spend (or releases on failure).
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, chronicleImageCost, "chronicle_image");
  if (!reservation.ok) {
    return reservationFailureResponse(reservation);
  }

  const settingPrompt = campaign.ai_setting_prompt ?? "";
  const { data: imageBaseRow } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "image_base").maybeSingle();
  const imageBasePrompt = imageBaseRow?.content ?? "";
  const prompt = buildPrompt(scene_text, text_descriptions, settingPrompt, imageBasePrompt);

  // Insert pending job — client polls/subscribes by id
  const jobId = await createImageJob(admin, {
    user_id: user.id,
    campaign_id,
    kind,
    prompt: scene_text.slice(0, 500),
    size,
    model,
    provider: img.provider,
  });

  // Background-task pattern: return job_id immediately, OpenAI call continues
  // past response. Deno Deploy's EdgeRuntime keeps the isolate alive for waitUntil.
  // @ts-ignore — EdgeRuntime is a Deno Deploy global, not in Deno's type defs.
  EdgeRuntime.waitUntil(runGeneration({
    jobId, userId: user.id, provider: img.provider, model, apiKey: img.apiKey,
    prompt, size, quality: img.imageQuality, portrait_urls, isByok, cost: chronicleImageCost,
    reservationIds: reservation.ids,
  }));

  return new Response(
    JSON.stringify({ job_id: jobId }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
