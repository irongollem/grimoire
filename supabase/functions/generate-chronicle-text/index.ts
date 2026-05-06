import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import {
  AI_PROMPT_LIMIT_LONG,
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

// ── Text providers ────────────────────────────────────────────────────────────

interface TextUsage { input_tokens: number; output_tokens: number; model: string; provider: string }
interface TextResult { content: string; usage: TextUsage }

async function openaiText(apiKey: string, system: string, user: string): Promise<TextResult> {
  const model = "gpt-4o-mini";
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

async function anthropicText(apiKey: string, system: string, user: string): Promise<TextResult> {
  const model = "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 8192,
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
    usage: { input_tokens: meta.promptTokenCount ?? 0, output_tokens: meta.candidatesTokenCount ?? 0, model, provider: "google" },
  };
}

// ── Usage logging ─────────────────────────────────────────────────────────────

async function logUsage(userId: string, isByok: boolean, textUsage: TextUsage): Promise<void> {
  await admin.from("ai_credit_ledger").insert({
    user_id: userId, delta: 0, reason: "chronicler_text", is_byok: isByok,
    model: textUsage.model, provider: textUsage.provider,
    input_tokens: textUsage.input_tokens, output_tokens: textUsage.output_tokens,
  });
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

  let campaign_id: string, raw_text: string, tone_instruction: string, entity_descriptions: string[];

  try {
    const body = await req.json();
    campaign_id        = body.campaign_id;
    raw_text           = body.raw_text;
    tone_instruction   = body.tone_instruction ?? "";
    entity_descriptions = Array.isArray(body.entity_descriptions) ? body.entity_descriptions : [];
    if (!campaign_id || !raw_text) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, raw_text, tone_instruction, entity_descriptions }", { status: 400 });
  }

  const promptCheck = validatePromptInput(raw_text, AI_PROMPT_LIMIT_LONG);
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

  const { data: promptRow } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "chronicle_text").maybeSingle();
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

  const entityBlock = entity_descriptions.length > 0
    ? entity_descriptions.map((d) => `- ${d}`).join("\n")
    : "No specific entities mentioned.";

  const settingBlock = campaign.ai_setting_prompt?.trim() ?? "No setting configured.";

  const systemContent = promptRow.content
    .replace("{entities}", entityBlock)
    .replace("{settingPrompt}", settingBlock)
    .replace("{toneInstruction}", tone_instruction) + INJECTION_GUARD_SUFFIX;

  async function decryptKey(enc: string | null): Promise<string | null> {
    if (!enc) return null;
    try { return await decryptValue(enc); } catch { return null; }
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

  const textProvider = campaign.text_provider ?? "openai";
  let textResult: TextResult;
  let textIsByok: boolean;

  try {
    if (textProvider === "anthropic" && anthropicKey) {
      textResult = await anthropicText(anthropicKey, systemContent, wrapUserInput(raw_text));
      textIsByok = !!campaignAnthropic;
    } else if (textProvider === "gemini" && geminiKey) {
      textResult = await geminiText(geminiKey, systemContent, wrapUserInput(raw_text));
      textIsByok = !!campaignGemini;
    } else {
      if (!openaiKey) return new Response("No OpenAI API key configured", { status: 422 });
      textResult = await openaiText(openaiKey, systemContent, wrapUserInput(raw_text));
      textIsByok = !!campaignOpenai;
    }
  } catch (e) {
    console.error("Chronicle text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  await logUsage(user.id, textIsByok, textResult.usage).catch(console.error);

  const parsed = JSON.parse(textResult.content) as { chronicle?: string };
  return new Response(
    JSON.stringify({ chronicle: parsed.chronicle ?? textResult.content }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
