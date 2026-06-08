import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, fetchUserBalance, recordGeneration, sizeMultiplier } from "../_shared/credits.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { buildSimpleImagePrompt } from "../_shared/image-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PARTY_SUFFIX =
  "The adventuring party from the reference portrait are present in this scene — they are the ones triggering or suffering the trap.";

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

// ── Text providers ────────────────────────────────────────────────────────────

interface TextUsage { input_tokens: number; output_tokens: number; model: string; provider: string }
interface TextResult { content: string; usage: TextUsage }

async function openaiText(apiKey: string, model: string, system: string, user: string): Promise<TextResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, response_format: { type: "json_object" },
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
      model, max_tokens: 4096,
      system: system + "\n\nRespond with a valid JSON object only, no markdown fencing.",
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
        generationConfig: { responseMimeType: "application/json" },
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

// ── Image providers ───────────────────────────────────────────────────────────

interface ImgResult { b64: string; input_tokens: number; input_image_tokens: number; output_tokens: number }

async function openaiImageGenerate(apiKey: string, model: string, prompt: string, size: string): Promise<ImgResult> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, size, output_format: "webp" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `OpenAI image error ${res.status}`);
  }
  const data = await res.json();
  return {
    b64: data.data[0].b64_json as string,
    input_tokens:       data.usage?.input_tokens_details?.text_tokens  ?? data.usage?.input_tokens ?? 0,
    input_image_tokens: 0,
    output_tokens:      data.usage?.output_tokens ?? 0,
  };
}

async function openaiImageEdit(apiKey: string, model: string, portraitUrl: string, prompt: string, size: string): Promise<ImgResult> {
  const portraitRes = await fetch(portraitUrl);
  if (!portraitRes.ok) throw new Error(`Failed to fetch portrait: ${portraitRes.status}`);
  const blob = await portraitRes.blob();

  const form = new FormData();
  form.append("model", model);
  form.append("image[]", new File([blob], "party.webp", { type: "image/webp" }));
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("output_format", "webp");
  form.append("n", "1");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `OpenAI image edit error ${res.status}`);
  }
  const data = await res.json();
  return {
    b64: data.data[0].b64_json as string,
    input_tokens:       data.usage?.input_tokens_details?.text_tokens  ?? data.usage?.input_tokens ?? 0,
    input_image_tokens: data.usage?.input_tokens_details?.image_tokens ?? 0,
    output_tokens:      data.usage?.output_tokens ?? 0,
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

  let campaign_id: string, prompt: string, trap_type: string | undefined,
      cr: string | undefined, generate_image: boolean,
      group_portrait_url: string | undefined;

  try {
    const body = await req.json();
    campaign_id        = body.campaign_id;
    prompt             = body.prompt;
    trap_type          = body.trap_type;
    cr                 = body.cr;
    generate_image     = body.generate_image !== false;
    group_portrait_url = body.group_portrait_url;
    if (!campaign_id || !prompt) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, prompt }", { status: 400 });
  }

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, text_provider, ai_setting_prompt, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members").select("role")
      .eq("campaign_id", campaign_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["trap", "image_base"]);
  const promptRow = promptRows?.find((r) => r.generator_type === "trap");
  const imageBasePrompt = promptRows?.find((r) => r.generator_type === "image_base")?.content ?? "";
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

  async function decryptKey(enc: string | null): Promise<string | null> {
    if (!enc) return null;
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

  const systemContent = promptRow.content + buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  const constraints: string[] = [];
  if (trap_type) constraints.push(`Trap Type: ${trap_type}`);
  if (cr) constraints.push(`CR: ${cr}`);
  const wrappedPrompt = wrapUserInput(prompt);
  const userContent = constraints.length ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}` : wrappedPrompt;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseTrapCost = textIsByok ? 0 : await fetchCreditCost(admin, "trap_generation");
  const trapCost = applyMultiplier(baseTrapCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);
  // The illustration is its own charge, reusing the entity_image cost (portrait
  // 1024×1536 → 1.5×). Images render via OpenAI, so BYOK is keyed on the OpenAI key.
  const imageIsByok = !!campaignOpenai;
  const trapImageCost = (generate_image && !imageIsByok)
    ? Math.round(
        applyMultiplier(await fetchCreditCost(admin, "entity_image"), providerConfigs.openai?.image_multiplier) *
        sizeMultiplier("1024x1536") * 100,
      ) / 100
    : 0;
  const trapTotalCost = trapCost + trapImageCost;
  if (trapTotalCost > 0) {
    const balance = await fetchUserBalance(admin, user.id);
    if (balance < trapTotalCost) {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", balance }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;
  const imgModel = providerConfigs.openai?.image_model ?? "gpt-image-1.5";

  let textResult: TextResult;

  try {
    if (textProvider === "anthropic" && anthropicKey) {
      textResult = await anthropicText(anthropicKey, textModel ?? "claude-haiku-3-20240307", systemContent, userContent);
    } else if (textProvider === "gemini" && geminiKey) {
      textResult = await geminiText(geminiKey, textModel ?? "gemini-2.5-flash", systemContent, userContent);
    } else {
      if (!openaiKey) return new Response("No OpenAI API key configured", { status: 422 });
      textResult = await openaiText(openaiKey, textModel ?? "gpt-4o-mini", systemContent, userContent);
    }
  } catch (e) {
    console.error("Trap text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const trapData = JSON.parse(textResult.content);

  // ── Image generation ─────────────────────────────────────────────────────
  let image_b64: string | null = null;
  let imgResult: ImgResult | null = null;

  if (generate_image && openaiKey) {
    try {
      const imagePrompt = buildSimpleImagePrompt({
        base: imageBasePrompt,
        setting: campaign.ai_setting_prompt ?? "",
        subject: trapData.image_prompt,
      });

      if (group_portrait_url) {
        imgResult = await openaiImageEdit(openaiKey, imgModel, group_portrait_url, [imagePrompt, PARTY_SUFFIX].join(" — "), "1024x1536");
      } else {
        imgResult = await openaiImageGenerate(openaiKey, imgModel, imagePrompt, "1024x1536");
      }
      image_b64 = imgResult.b64;
    } catch (e) {
      console.error("Trap image generation failed (non-fatal):", e);
    }
  }

  // Log text generation (with credit deduction)
  await recordGeneration(admin, user.id, "trap_generation", textIsByok, trapCost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  // Charge the illustration as its own entity_image row (or delta=0 on BYOK).
  if (imgResult) {
    await recordGeneration(admin, user.id, "entity_image", imageIsByok, trapImageCost, {
      model: imgModel, provider: "openai", image_count: 1,
      input_tokens:       imgResult.input_tokens || undefined,
      input_image_tokens: imgResult.input_image_tokens || undefined,
      output_tokens:      imgResult.output_tokens || undefined,
    });
  }

  return new Response(
    JSON.stringify({ ...trapData, image_b64 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
