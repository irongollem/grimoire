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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAP_BASE_PROMPT =
  "Top-down fantasy cartography map. Hand-drawn ink style, bird's-eye view, clean linework, labeled zones, hatching for walls and elevation, minimal colour. Readable as a functional map, not a painting.";

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

// ── Image provider ────────────────────────────────────────────────────────────

async function openaiImageGenerate(apiKey: string, model: string, prompt: string, size: string): Promise<string> {
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
  return data.data[0].b64_json as string;
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

  let campaign_id: string, prompt: string, location_type: string | undefined,
      parent_name: string | undefined, generate_image: boolean, generate_map: boolean;

  try {
    const body = await req.json();
    campaign_id    = body.campaign_id;
    prompt         = body.prompt;
    location_type  = body.location_type;
    parent_name    = body.parent_name;
    generate_image = body.generate_image !== false;
    generate_map   = body.generate_map === true;
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
    .in("generator_type", ["location", "image_base"]);
  const promptRow = promptRows?.find((r) => r.generator_type === "location");
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
  if (location_type) constraints.push(`Location Type: ${location_type}`);
  if (parent_name) constraints.push(`Parent Location: ${parent_name}`);
  const wrappedPrompt = wrapUserInput(prompt);
  const userContent = constraints.length ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}` : wrappedPrompt;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseLocationCost = textIsByok ? 0 : await fetchCreditCost(admin, "location_generation");
  const locationCost = applyMultiplier(baseLocationCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);
  if (locationCost > 0) {
    const balance = await fetchUserBalance(admin, user.id);
    if (balance < locationCost) {
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
    console.error("Location text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const locationData = JSON.parse(textResult.content);

  // ── Images in parallel ────────────────────────────────────────────────────
  let image_b64: string | null = null;
  let map_b64: string | null = null;
  let imageCount = 0;

  if (openaiKey && (generate_image || generate_map)) {
    const [imgResult, mapResult] = await Promise.allSettled([
      generate_image
        ? openaiImageGenerate(openaiKey, imgModel,
            [imageBasePrompt, campaign.ai_setting_prompt, locationData.image_prompt].filter(Boolean).join(" — "),
            "1024x1024")
        : Promise.resolve(null),
      generate_map
        ? openaiImageGenerate(openaiKey, imgModel,
            [MAP_BASE_PROMPT, locationData.map_prompt].filter(Boolean).join(" — "),
            "1024x1024")
        : Promise.resolve(null),
    ]);

    if (imgResult.status === "fulfilled" && imgResult.value) { image_b64 = imgResult.value; imageCount++; }
    if (mapResult.status === "fulfilled" && mapResult.value) { map_b64 = mapResult.value; imageCount++; }
  }

  await recordGeneration(admin, user.id, "location_generation", textIsByok, locationCost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
    image_count: imageCount > 0 ? imageCount : undefined,
  });

  return new Response(
    JSON.stringify({ ...locationData, image_b64, map_b64 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
