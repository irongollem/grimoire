import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, recordGeneration, releaseCredits, reserveCredits, sizeMultiplier } from "../_shared/credits.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import {
  AI_PROMPT_LIMIT_LONG,
  INJECTION_GUARD_SUFFIX,
  MAX_IMAGE_SUBJECT_CHARS,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { buildImagePromptAuthorSystem, buildSimpleImagePrompt } from "../_shared/image-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// ── Text providers (plain-text output — the model authors a visual prompt) ──────

interface TextUsage { input_tokens: number; output_tokens: number; model: string; provider: string }
interface TextResult { content: string; usage: TextUsage }

async function openaiText(apiKey: string, model: string, system: string, user: string): Promise<TextResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `OpenAI text error ${res.status}`);
  }
  const data = await res.json();
  return {
    content: data.choices[0].message.content as string,
    usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0, model, provider: "openai" },
  };
}

async function anthropicText(apiKey: string, model: string, system: string, user: string): Promise<TextResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Anthropic error ${res.status}`);
  }
  const data = await res.json();
  return {
    content: data.content[0].text as string,
    usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0, model, provider: "anthropic" },
  };
}

async function geminiText(apiKey: string, model: string, system: string, user: string): Promise<TextResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Gemini error ${res.status}`);
  }
  const data = await res.json();
  const meta = data.usageMetadata ?? {};
  return {
    content: data.candidates[0].content.parts[0].text as string,
    usage: { input_tokens: meta.promptTokenCount ?? 0, output_tokens: meta.candidatesTokenCount ?? 0, model, provider: "google" },
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
    .select("id, user_id, ai_enabled, text_provider, image_provider, ai_setting_prompt, openai_api_key, anthropic_api_key, gemini_api_key, falai_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled === false) return new Response("AI is disabled for this campaign", { status: 403 });

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

  const [[campaignOpenai, campaignAnthropic, campaignGemini, campaignFalai], platformKeys, providerConfigs] = await Promise.all([
    Promise.all([
      decryptKey(campaign.openai_api_key),
      decryptKey(campaign.anthropic_api_key),
      decryptKey(campaign.gemini_api_key),
      decryptKey(campaign.falai_api_key),
    ]),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini", "falai"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini", "falai"]),
  ]);
  const openaiKey    = campaignOpenai    ?? platformKeys.openai    ?? null;
  const anthropicKey = campaignAnthropic ?? platformKeys.anthropic ?? null;
  const geminiKey    = campaignGemini    ?? platformKeys.gemini    ?? null;

  // Resolve the campaign's chosen image provider (openai / openai-mini / falai / gemini).
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    campaignKeys: { openai: campaignOpenai, falai: campaignFalai, gemini: campaignGemini },
    platformKeys: { openai: platformKeys.openai, falai: platformKeys.falai, gemini: platformKeys.gemini },
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
  const reservation = await reserveCredits(admin, user.id, cost, "entity_image");
  if (!reservation.ok) {
    return new Response(
      JSON.stringify({ error: "insufficient_credits", balance: reservation.balance ?? 0 }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
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
    if (textProvider === "anthropic" && anthropicKey) {
      textResult = await anthropicText(anthropicKey, textModel ?? "claude-haiku-3-20240307", systemContent, userContent);
    } else if (textProvider === "gemini" && geminiKey) {
      textResult = await geminiText(geminiKey, textModel ?? "gemini-2.5-flash", systemContent, userContent);
    } else {
      textResult = await openaiText(openaiKey, textModel ?? "gpt-4o-mini", systemContent, userContent);
    }
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("Entity image prompt authoring failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Prompt authoring failed" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Cap the model-authored subject so a coaxed long prompt can't inflate the
  // (token-priced) image call beyond what the credit cost assumes.
  const subject = textResult.content.trim().slice(0, MAX_IMAGE_SUBJECT_CHARS);
  if (!subject) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "The AI did not return an image description." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Release the hold and charge once for the image (delta = -cost, or 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "entity_image", isByok, cost, {
    model: img.model, provider: imgResult.usage.provider, image_count: 1,
    input_tokens:       imgResult.usage.input_tokens       || undefined,
    input_image_tokens: imgResult.usage.input_image_tokens || undefined,
    output_tokens:      imgResult.usage.output_tokens      || undefined,
  });
  // Analytics-only row for the prompt-author text tokens (no extra deduction).
  await recordGeneration(admin, user.id, "entity_image_prompt", isByok, 0, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  }).catch(console.error);

  return new Response(
    JSON.stringify({ image_b64: imgResult.b64 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
