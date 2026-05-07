import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
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



function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

// ── Text providers ────────────────────────────────────────────────────────────

interface TextUsage { input_tokens: number; output_tokens: number; model: string; provider: string }
interface TextResult { content: string; usage: TextUsage }

async function openaiText(apiKey: string, system: string, user: string): Promise<TextResult> {
  const model = "gpt-4o-mini";
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

async function anthropicText(apiKey: string, system: string, user: string): Promise<TextResult> {
  const model = "claude-sonnet-4-6";
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

async function geminiText(apiKey: string, system: string, user: string): Promise<TextResult> {
  const model = "gemini-3.1-flash";
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

interface ImageUsage { model: string; provider: string; image_count: number }
interface ImageResult { b64: string; usage: ImageUsage }

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
  return { b64: data.data[0].b64_json as string, usage: { model, provider: "openai", image_count: 1 } };
}

async function openaiImageEdit(apiKey: string, model: string, sourceB64: string, prompt: string, size: string): Promise<ImageResult> {
  // Decode B64 back to bytes for the multipart upload
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
  return { b64: data.data[0].b64_json as string, usage: { model, provider: "openai", image_count: 1 } };
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
  let imageModel: string;

  try {
    const body = await req.json();
    campaign_id    = body.campaign_id;
    prompt         = body.prompt;
    generateAlterEgo = body.generate_alter_ego === true;
    generateImage  = body.generate_image !== false;
    imageModel     = body.image_model ?? "gpt-image-2";
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

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys] = await Promise.all([
    Promise.all([
      decryptKey(campaign.openai_api_key),
      decryptKey(campaign.anthropic_api_key),
      decryptKey(campaign.gemini_api_key),
    ]),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
  ]);
  const openaiKey    = campaignOpenai    ?? platformKeys.openai    ?? null;
  const anthropicKey = campaignAnthropic ?? platformKeys.anthropic ?? null;
  const geminiKey    = campaignGemini    ?? platformKeys.gemini    ?? null;

  // ── Determine provider + isByok before generating (needed for credit check) ──
  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" && !!anthropicKey
    ? !!campaignAnthropic
    : textProvider === "gemini" && !!geminiKey
    ? !!campaignGemini
    : !!campaignOpenai;
  const imageIsByok = !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const [npcTextCost, portraitCostEach] = await Promise.all([
    textIsByok ? Promise.resolve(0) : fetchCreditCost(admin, "npc_text"),
    imageIsByok || !generateImage ? Promise.resolve(0) : fetchCreditCost(admin, "portrait"),
  ]);
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

  try {
    if (textProvider === "anthropic" && anthropicKey) {
      textResult = await anthropicText(anthropicKey, systemContent, userContent);
    } else if (textProvider === "gemini" && geminiKey) {
      textResult = await geminiText(geminiKey, systemContent, userContent);
    } else {
      if (!openaiKey) return new Response("No OpenAI API key configured", { status: 422 });
      textResult = await openaiText(openaiKey, systemContent, userContent);
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
  const imgModel = imageModel;

  if (generateImage && openaiKey && npcData.true_portrait_prompt) {
    const imagePrompt = [
      `Style: ${imageBasePrompt}`,
      campaign.ai_setting_prompt ? `Setting: ${campaign.ai_setting_prompt}` : null,
      `Subject: ${npcData.true_portrait_prompt}`,
    ].filter(Boolean).join("\n");

    try {
      const { b64 } = await openaiImageGenerate(openaiKey, imgModel, imagePrompt, "1024x1536");
      portrait_b64 = b64;
      totalImageCount++;
    } catch (e) {
      console.error("Portrait generation failed:", e);
      // non-fatal — continue without portrait
    }

    if (generateAlterEgo && portrait_b64 && npcData.disguise_image_prompt) {
      const disguisePrompt = [imageBasePrompt, campaign.ai_setting_prompt, npcData.disguise_image_prompt]
        .filter(Boolean)
        .join(" — ");
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
      model: imgModel, provider: "openai", image_count: totalImageCount,
    }));
  }
  await Promise.allSettled(recordPromises);

  // ── Return result ───────────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ ...npcData, portrait_b64, disguise_portrait_b64 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
