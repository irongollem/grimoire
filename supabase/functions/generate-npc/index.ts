import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, fetchUserBalance, recordGeneration } from "../_shared/credits.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { buildLabelledImagePrompt, buildSimpleImagePrompt } from "../_shared/image-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);



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
      model,
      response_format: { type: "json_object" },
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
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      model,
      provider: "openai",
    },
  };
}

async function anthropicText(apiKey: string, model: string, system: string, user: string): Promise<TextResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
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
    usage: {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      model,
      provider: "anthropic",
    },
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
    usage: {
      input_tokens: meta.promptTokenCount ?? 0,
      output_tokens: meta.candidatesTokenCount ?? 0,
      model,
      provider: "google",
    },
  };
}

// ── Image providers ───────────────────────────────────────────────────────────

interface ImageUsage {
  model: string;
  provider: string;
  image_count: number;
  input_tokens?: number;
  input_image_tokens?: number;
  output_tokens?: number;
}
interface ImageResult { b64: string; usage: ImageUsage }

function extractOpenAiImageUsage(data: { usage?: { input_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number }; output_tokens?: number } }, model: string): ImageUsage {
  const u = data.usage;
  return {
    model,
    provider: "openai",
    image_count: 1,
    input_tokens:       u?.input_tokens_details?.text_tokens ?? u?.input_tokens ?? 0,
    input_image_tokens: u?.input_tokens_details?.image_tokens ?? 0,
    output_tokens:      u?.output_tokens ?? 0,
  };
}

async function openaiImageGenerate(apiKey: string, model: string, prompt: string, size: string): Promise<ImageResult> {
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
  return { b64: data.data[0].b64_json as string, usage: extractOpenAiImageUsage(data, model) };
}

async function openaiImageEdit(apiKey: string, model: string, sourceB64: string, prompt: string, size: string): Promise<ImageResult> {
  const bytes = Uint8Array.from(atob(sourceB64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/webp" });
  const form = new FormData();
  form.append("model", model);
  form.append("image[]", new File([blob], "portrait.webp", { type: "image/webp" }));
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
  return { b64: data.data[0].b64_json as string, usage: extractOpenAiImageUsage(data, model) };
}

async function falaiImageGenerate(apiKey: string, model: string, prompt: string): Promise<ImageResult> {
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
    body: JSON.stringify({ prompt, image_size: { width: 768, height: 1152 } }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `fal.ai error ${res.status}`);
  }
  const { images } = await res.json();
  const imgRes = await fetch(images[0].url);
  if (!imgRes.ok) throw new Error(`fal.ai image fetch error ${imgRes.status}`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return { b64: btoa(binary), usage: { model, provider: "falai", image_count: 1 } };
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

  // ── Parse body ──────────────────────────────────────────────────────────────
  let campaign_id: string;
  let prompt: string;
  let generateAlterEgo: boolean;
  let generateImage: boolean;

  try {
    const body = await req.json();
    campaign_id      = body.campaign_id;
    prompt           = body.prompt;
    generateAlterEgo = body.generate_alter_ego === true;
    generateImage    = body.generate_image !== false;
    if (!campaign_id || !prompt) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, prompt }", { status: 400 });
  }

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // ── Fetch campaign + verify access ──────────────────────────────────────────
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, text_provider, image_provider, ai_setting_prompt, openai_api_key, anthropic_api_key, gemini_api_key, falai_api_key")
    .eq("id", campaign_id)
    .maybeSingle();

  if (!campaign) return new Response("Campaign not found", { status: 404 });

  // ── Fetch system prompts from DB ────────────────────────────────────────────
  const { data: promptRows } = await admin
    .from("ai_system_prompts")
    .select("generator_type, content")
    .in("generator_type", ["npc", "image_base"]);
  const promptRow = promptRows?.find((r) => r.generator_type === "npc");
  const imageBasePrompt = promptRows?.find((r) => r.generator_type === "image_base")?.content ?? "";
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

  if (campaign.user_id !== user.id) {
    const { data: membership } = await admin
      .from("campaign_members")
      .select("role")
      .eq("campaign_id", campaign_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403 });
  }

  // ── Decrypt API keys ────────────────────────────────────────────────────────
  async function decryptKey(encrypted: string | null): Promise<string | null> {
    if (!encrypted) return null;
    try { return await decryptValue(encrypted); } catch { return null; }
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
  const falaiKey     = campaignFalai     ?? platformKeys.falai     ?? null;

  // ── Determine provider + isByok before generating (needed for credit check) ──
  const textProvider  = campaign.text_provider  ?? "openai";
  const imageProvider = campaign.image_provider ?? "openai";

  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;
  const imageIsByok = imageProvider === "falai" ? !!campaignFalai : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const [baseTextCost, basePortraitCost] = await Promise.all([
    textIsByok ? Promise.resolve(0) : fetchCreditCost(admin, "npc_text"),
    imageIsByok || !generateImage ? Promise.resolve(0) : fetchCreditCost(admin, "portrait"),
  ]);
  const textMultiplier  = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier;
  const imageMultiplier = providerConfigs[imageProvider as keyof typeof providerConfigs]?.image_multiplier;
  const npcTextCost    = applyMultiplier(baseTextCost, textMultiplier);
  const portraitCostEach = applyMultiplier(basePortraitCost, imageMultiplier);
  const maxImages = generateImage ? (generateAlterEgo ? 2 : 1) : 0;
  const totalNeeded = npcTextCost + portraitCostEach * maxImages;
  if (totalNeeded > 0) {
    const balance = await fetchUserBalance(admin, user.id);
    if (balance < totalNeeded) {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", balance }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  let textResult: TextResult;

  const systemContent =
    promptRow.content + buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  const userContent = generateAlterEgo
    ? `${wrapUserInput(prompt)}\n\nThis NPC has a disguise identity — populate disguise_name and disguise_image_prompt.`
    : wrapUserInput(prompt);

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

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
    console.error("NPC text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const npcData = JSON.parse(textResult.content);

  if (generateAlterEgo && (!npcData.disguise_name || !npcData.disguise_image_prompt)) {
    return new Response(
      JSON.stringify({ error: "AI response was missing disguise fields — please try again." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Image generation ────────────────────────────────────────────────────────
  let portrait_b64: string | null = null;
  let disguise_portrait_b64: string | null = null;
  let totalImageCount = 0;
  const imgModelConfig = providerConfigs[imageProvider as keyof typeof providerConfigs]?.image_model;
  const imgModel = imgModelConfig ?? (imageProvider === "falai" ? "fal-ai/flux-2/flex" : "gpt-image-1.5");

  if (generateImage && npcData.true_portrait_prompt) {
    const imagePrompt = buildLabelledImagePrompt({
      base: imageBasePrompt,
      setting: campaign.ai_setting_prompt ?? "",
      subject: npcData.true_portrait_prompt,
    });

    try {
      if (imageProvider === "falai" && falaiKey) {
        const { b64 } = await falaiImageGenerate(falaiKey, imgModel, imagePrompt);
        portrait_b64 = b64;
        totalImageCount++;
      } else if (openaiKey) {
        const { b64 } = await openaiImageGenerate(openaiKey, imgModel, imagePrompt, "1024x1536");
        portrait_b64 = b64;
        totalImageCount++;
      }
    } catch (e) {
      console.error("Portrait generation failed:", e);
      // non-fatal — continue without portrait
    }

    // Alter-ego disguise uses OpenAI edit — skip if using fal.ai (no edit endpoint)
    if (imageProvider !== "falai" && generateAlterEgo && portrait_b64 && npcData.disguise_image_prompt && openaiKey) {
      const disguisePrompt = buildSimpleImagePrompt({
        base: imageBasePrompt,
        setting: campaign.ai_setting_prompt ?? "",
        subject: npcData.disguise_image_prompt,
      });
      try {
        const { b64 } = await openaiImageEdit(openaiKey, imgModel, portrait_b64, disguisePrompt, "1024x1536");
        disguise_portrait_b64 = b64;
        totalImageCount++;
      } catch (e) {
        console.error("Disguise portrait generation failed (non-fatal):", e);
      }
    }
  }

  // ── Record usage (deduct credits for platform-key, log-only for BYOK) ────────
  const recordPromises: Promise<void>[] = [
    recordGeneration(admin, user.id, "npc_text", textIsByok, npcTextCost, {
      model: textResult.usage.model, provider: textResult.usage.provider,
      input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
    }),
  ];
  if (totalImageCount > 0) {
    recordPromises.push(recordGeneration(admin, user.id, "portrait", imageIsByok, portraitCostEach * totalImageCount, {
      model: imgModel, provider: imageProvider, image_count: totalImageCount,
    }));
  }
  await Promise.allSettled(recordPromises);

  // ── Return result ───────────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ ...npcData, portrait_b64, disguise_portrait_b64 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
