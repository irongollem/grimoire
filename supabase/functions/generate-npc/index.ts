import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
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

// ── Prompts (mirror of src/ai/prompts.ts) ────────────────────────────────────

const NPC_SYSTEM_PROMPT = `You are a creative assistant for Dungeons & Dragons 5e campaign management.

Generate a detailed NPC based on the dungeon master's description. Return a single JSON object with exactly these fields:

{
  "name": "Full name",
  "race": "D&D 5e race (e.g. Human, Elf, Tiefling, Dwarf, Half-Orc)",
  "alignment": "One of: Lawful Good, Neutral Good, Chaotic Good, Lawful Neutral, True Neutral, Chaotic Neutral, Lawful Evil, Neutral Evil, Chaotic Evil, Unaligned",
  "age": "Age as a string (e.g. '45', 'Young adult', 'Elder', 'Ancient')",
  "occupation": "Their role or profession",
  "appearance": "2–3 paragraphs: physical build, face, hair, clothing, distinguishing features. Separate paragraphs with a blank line. Plain text only.",
  "personality": "Four labelled sections using this exact format — a ## heading line followed by the content paragraph, each section separated by a blank line:[2–3 sentences on behaviour, mannerisms, and speech patterns]\n\n## Ideal \n\n[1–2 sentences on what they believe in or what drives them]\n\n## Bond \n\n[1–2 sentences on their connection to a person, place, or cause]\n\n## Flaw \n\n[1–2 sentences on their weakness, compulsion, or fear]",
  "backstory": "3–4 paragraphs of history, origin, and formative events. Separate paragraphs with a blank line. Plain text only.",
  "notes": "1–2 paragraphs of DM-facing content: secrets, plot hooks, rumours, hidden motives. Separate paragraphs with a blank line. Plain text only.",
  "status": "One of: alive, dead, missing, unknown",
  "relationship": "One of: ally, neutral, enemy, unknown",
  "tags": ["3 to 5 short descriptive tags"],
  "true_portrait_prompt": "A concise single-subject portrait description. Describe only the person: physical features, expression, pose, clothing, and the immediate 1–2 metre environment around them. No scenery, no wide shots, no other characters. No style or art direction.",
  "disguise_name": "If this NPC has a disguise identity: a plausible false name — full first and last name, matching their species and setting. If no disguise: null",
  "disguise_image_prompt": "If this NPC has a disguise identity: portrait edit instructions describing only what changes from the true form — hairstyle, colour, clothing, accessories, expression. Write as change instructions, not a fresh description. Do NOT redescribe fixed features. Example: 'Change hair to short brown, add wool cap, replace armour with plain merchant clothing.' If no disguise: null"
}

Return only the JSON object. No markdown fences, no explanation.

Whether a disguise is requested is indicated in the user's prompt. Set disguise_name and disguise_image_prompt to null when no disguise is requested.`;

const IMAGE_BASE_PROMPT =
  "Refined semi-realistic painterly fantasy illustration. Clearly illustrated, polished, and non-photographic. Controlled brushwork, clean shape design, clear form modeling, readable anatomy, expressive faces, strong silhouettes, atmospheric depth, restrained texture, and a cohesive finished surface. Favor stronger value separation, firmer structure, cleaner edge control, sharper facial planes, and clearer focal hierarchy. Keep colors tasteful and moderately muted with selective accents for clarity and emphasis. Prioritize readability, subject clarity, and elegant painterly fantasy over spectacle or realism. Avoid photorealism, cinematic or camera-driven aesthetics, glossy realism, lens blur, pores, oversharpening, noisy micro-detail, muddy rendering, excessive grit, rough sketchiness, cartoon stylization, anime stylization, overly soft diffusion, fuzzy texture overload, and cluttered ornamental detail that weakens the silhouette or focal read.";

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

// ── Usage logging ─────────────────────────────────────────────────────────────

async function logUsage(params: {
  userId: string;
  reason: string;
  textUsage?: TextUsage;
  imageCount?: number;
  imageModel?: string;
  imageProvider?: string;
}): Promise<void> {
  const { userId, reason, textUsage, imageCount, imageModel, imageProvider } = params;
  await admin.from("ai_credit_ledger").insert({
    user_id: userId,
    delta: 0,
    reason,
    is_byok: true,
    model:         textUsage?.model    ?? imageModel,
    provider:      textUsage?.provider ?? imageProvider,
    input_tokens:  textUsage?.input_tokens,
    output_tokens: textUsage?.output_tokens,
    image_count:   imageCount,
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

  const [openaiKey, anthropicKey, geminiKey] = await Promise.all([
    decryptKey(campaign.openai_api_key),
    decryptKey(campaign.anthropic_api_key),
    decryptKey(campaign.gemini_api_key),
  ]);

  // ── Select text provider ────────────────────────────────────────────────────
  const textProvider = campaign.text_provider ?? "openai";
  let textResult: TextResult;

  const systemContent =
    NPC_SYSTEM_PROMPT + buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  const userContent = generateAlterEgo
    ? `${wrapUserInput(prompt)}\n\nThis NPC has a disguise identity — populate disguise_name and disguise_image_prompt.`
    : wrapUserInput(prompt);

  try {
    if (textProvider === "anthropic" && anthropicKey) {
      textResult = await anthropicText(anthropicKey, systemContent, userContent);
    } else if (textProvider === "gemini" && geminiKey) {
      textResult = await geminiText(geminiKey, systemContent, userContent);
    } else {
      if (!openaiKey) return new Response("No OpenAI API key configured for this campaign", { status: 422 });
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
      `Style: ${IMAGE_BASE_PROMPT}`,
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
      const disguisePrompt = [IMAGE_BASE_PROMPT, campaign.ai_setting_prompt, npcData.disguise_image_prompt]
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

  // ── Log usage ───────────────────────────────────────────────────────────────
  // Log text + image usage in two separate rows so the model column is accurate for each.
  const logPromises: Promise<void>[] = [
    logUsage({ userId: user.id, reason: "npc_generation", textUsage: textResult.usage }),
  ];
  if (totalImageCount > 0) {
    logPromises.push(logUsage({
      userId: user.id,
      reason: "npc_portrait",
      imageCount: totalImageCount,
      imageModel: imgModel,
      imageProvider: "openai",
    }));
  }
  await Promise.allSettled(logPromises);

  // ── Return result ───────────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ ...npcData, portrait_b64, disguise_portrait_b64 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
