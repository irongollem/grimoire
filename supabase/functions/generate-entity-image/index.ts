import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, recordGeneration, releaseCredits, reserveCredits, reservationFailureResponse, sizeMultiplier } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import {
  AI_PROMPT_LIMIT_LONG,
  INJECTION_GUARD_SUFFIX,
  MAX_IMAGE_SUBJECT_CHARS,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { buildImagePromptAuthorSystem, buildSimpleImagePrompt } from "../_shared/image-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, type TextResult } from "../_shared/textGen.ts";

// Entity portraits always render portrait-orientation.
const ENTITY_IMAGE_SIZE = "1024x1536";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

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

  // Frozen accounts cannot generate — including BYOK, which skips the credit gate.
  if (await isAccountSuspended(admin, user.id)) return suspendedResponse();

  let campaign_id: string, kind: string, context: string;

  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    kind        = body.kind;
    context     = body.context;
    if (!campaign_id || !kind || !context) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, kind, context }", { status: 400 });
  }

  const promptCheck = validatePromptInput(context, AI_PROMPT_LIMIT_LONG);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, image_provider, ai_setting_prompt, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  const { data: imageBaseRow } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "image_base").maybeSingle();
  const imageBasePrompt = imageBaseRow?.content ?? "";

  // BYOK is Pro-only: ignore stored campaign keys unless the owner is currently Pro.
  const ownerIsPro = await isUserPro(admin, campaign.user_id);
  async function decryptKey(enc: string | null): Promise<string | null> {
    if (!enc || !ownerIsPro) return null;
    try { return await decryptValue(enc); } catch { return null; }
  }

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    Promise.all([
      decryptKey(campaign.openai_api_key),
      decryptKey(campaign.anthropic_api_key),
      decryptKey(campaign.gemini_api_key),
    ]),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);
  const openaiKey    = campaignOpenai    ?? platformKeys.openai    ?? null;
  const anthropicKey = campaignAnthropic ?? platformKeys.anthropic ?? null;
  const geminiKey    = campaignGemini    ?? platformKeys.gemini    ?? null;

  // Resolve the campaign's chosen image provider (openai / openai-mini / gemini).
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    campaignKeys: { openai: campaignOpenai, gemini: campaignGemini },
    platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
    providerConfigs,
  });
  if (!img) return new Response("No image API key configured", { status: 422 });
  const isByok = img.isByok;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  // Entity portraits render at ENTITY_IMAGE_SIZE; cost scales with output area
  // (portrait = 1.5× a square render) and the chosen provider's multiplier.
  const baseCost = isByok ? 0 : await fetchCreditCost(admin, "entity_image");
  const cost = Math.round(
    applyMultiplier(baseCost, img.imageMultiplier) *
    sizeMultiplier(ENTITY_IMAGE_SIZE) * 100,
  ) / 100;
  // Atomic affordability gate: hold the balance across the paid text+image calls.
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "entity_image");
  if (!reservation.ok) {
    return reservationFailureResponse(reservation);
  }

  // ── 1. Author a visual prompt from the entity's facts ──────────────────────
  const systemContent =
    buildImagePromptAuthorSystem(kind) +
    buildCampaignContext(campaign.ai_setting_prompt) +
    INJECTION_GUARD_SUFFIX;
  const userContent = wrapUserInput(context);

  const textProvider = campaign.text_provider ?? "openai";
  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;
  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
      maxTokens: textProvider === "anthropic" && anthropicKey ? 1024 : undefined,
      outputFormat: "text",
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("Entity image prompt authoring failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Prompt authoring failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Cap the model-authored subject so a coaxed long prompt can't inflate the
  // (token-priced) image call beyond what the credit cost assumes.
  const subject = textResult.content.trim().slice(0, MAX_IMAGE_SUBJECT_CHARS);
  if (!subject) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "The AI did not return an image description." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 2. Render the image ────────────────────────────────────────────────────
  const imagePrompt = buildSimpleImagePrompt({
    base: imageBasePrompt,
    setting: campaign.ai_setting_prompt ?? "",
    subject,
  });

  let imgResult;
  try {
    imgResult = await generateImage({
      provider: img.provider, model: img.model, apiKey: img.apiKey,
      prompt: imagePrompt, size: ENTITY_IMAGE_SIZE, quality: img.imageQuality, boostStyle: true,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("Entity image generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Image generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Release the hold and charge once for the image (delta = -cost, or 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "entity_image", isByok, cost, {
    model: img.model, quality: img.imageQuality, size: ENTITY_IMAGE_SIZE,
    provider: imgResult.usage.provider, image_count: 1,
    input_tokens:       imgResult.usage.input_tokens       || undefined,
    input_image_tokens: imgResult.usage.input_image_tokens || undefined,
    output_tokens:      imgResult.usage.output_tokens      || undefined,
  });
  // Analytics-only row for the prompt-author text tokens (no extra deduction).
  await recordGeneration(admin, user.id, "entity_image_prompt", isByok, 0, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  }).catch(console.error);

  // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. This
  // endpoint has no server-side upload (the client uploads image_b64), so
  // the response is the last point the resolved provider/model are known.
  const prov: AiProvenance = {
    generatorType: kind,
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
