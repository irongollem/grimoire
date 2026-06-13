import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchCreditCost, fetchUserBalance, recordGeneration, sizeMultiplier } from "../_shared/credits.ts";
import { createImageJob, completeImageJob, failImageJob, type ImageJobKind } from "../_shared/imageJob.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";
import { generateImage, resolveImageProvider, type ImageProviderKey } from "../_shared/imageGen.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const path = `${userId}/scene-${Date.now()}.webp`;
  // Storage occasionally returns a transient 502/Bad Gateway. The generated
  // image is already in memory and re-running the OpenAI call is expensive, so
  // retry the upload a few times with backoff before giving up. upsert:true so a
  // partially-written object from a failed attempt doesn't cause a 409.
  let lastErr = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { error } = await admin.storage.from("chronicle").upload(path, bin, {
      contentType: "image/webp",
      upsert: true,
    });
    if (!error) {
      const { data } = admin.storage.from("chronicle").getPublicUrl(path);
      return data.publicUrl;
    }
    lastErr = error.message;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw new Error(`Upload failed after 4 attempts: ${lastErr}`);
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
}) {
  const { jobId, userId, provider, model, apiKey, prompt, size, quality, portrait_urls, isByok, cost } = args;

  try {
    // Fetch reference portrait blobs in parallel (openai + gemini compose them).
    const portraitBlobs: Blob[] = [];
    if (portrait_urls.length > 0) {
      const results = await Promise.allSettled(
        portrait_urls.map((url) => fetch(url).then((r) => r.ok ? r.blob() : null)),
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

    await recordGeneration(admin, userId, "chronicle_image", isByok, cost, {
      model,
      provider: usage.provider,
      image_count: 1,
      input_tokens: usage.input_tokens,
      input_image_tokens: usage.input_image_tokens || undefined,
      output_tokens: usage.output_tokens || undefined,
    }).catch(console.error);
  } catch (e) {
    console.error("Chronicle image generation failed:", e);
    await failImageJob(admin, jobId, e instanceof Error ? e.message : "Image generation failed");
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

const text = (msg: string, status: number) =>
  new Response(msg, { status, headers: corsHeaders });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
    .select("id, user_id, ai_setting_prompt, image_provider, openai_api_key, gemini_api_key, falai_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return text("Campaign not found", 404);

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return text("Forbidden", 403);
  }

  const decryptKey = (enc: string | null) => enc ? decryptValue(enc).catch(() => null) : Promise.resolve(null);
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
  if (chronicleImageCost > 0) {
    const balance = await fetchUserBalance(admin, user.id);
    if (balance < chronicleImageCost) {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", balance }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
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
  }));

  return new Response(
    JSON.stringify({ job_id: jobId }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
