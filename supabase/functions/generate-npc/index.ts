import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import {
  fetchProviderConfigs,
  applyMultiplier,
} from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  sizeMultiplier,
  reservationFailureResponse,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { resolveImageProvider } from "../_shared/imageGen.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  MAX_IMAGE_SUBJECT_CHARS,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import {
  buildLabelledImagePrompt,
  buildSimpleImagePrompt,
} from "../_shared/image-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Portrait render size per image provider — drives the area-based cost multiplier.
const PORTRAIT_SIZE_BY_PROVIDER: Record<string, string> = {
  openai: "1024x1536",
  falai: "768x1152",
  gemini: "1024x1536",
};

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

// ── Text providers ────────────────────────────────────────────────────────────

interface TextUsage {
  input_tokens: number;
  output_tokens: number;
  model: string;
  provider: string;
}
interface TextResult {
  content: string;
  usage: TextUsage;
}

async function openaiText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<TextResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
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

async function anthropicText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<TextResult> {
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
      system:
        system +
        "\n\nRespond with a valid JSON object only, no markdown fencing.",
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

async function geminiText(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<TextResult> {
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

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  // ── Parse body ──────────────────────────────────────────────────────────────
  let campaign_id: string;
  let prompt: string;
  let generateAlterEgo: boolean;
  let generateImage: boolean;

  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    prompt = body.prompt;
    generateAlterEgo = body.generate_alter_ego === true;
    generateImage = body.generate_image !== false;
    if (!campaign_id || !prompt) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, prompt }", {
      status: 400,
    });
  }

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // ── Fetch campaign + verify access ──────────────────────────────────────────
  const { data: campaign } = await admin
    .from("campaigns")
    .select(
      "id, user_id, text_provider, image_provider, ai_setting_prompt, openai_api_key, anthropic_api_key, gemini_api_key, falai_api_key",
    )
    .eq("id", campaign_id)
    .maybeSingle();

  if (!campaign) return new Response("Campaign not found", { status: 404 });

  // ── Fetch system prompts from DB ────────────────────────────────────────────
  const { data: promptRows } = await admin
    .from("ai_system_prompts")
    .select("generator_type, content")
    .in("generator_type", ["npc", "image_base"]);
  const promptRow = promptRows?.find((r) => r.generator_type === "npc");
  const imageBasePrompt =
    promptRows?.find((r) => r.generator_type === "image_base")?.content ?? "";
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
  // BYOK is Pro-only: only honor a campaign's stored keys while the owner is on
  // a paid plan, so a lapsed-Pro user's old key is no longer treated as BYOK.
  const ownerIsPro = await isUserPro(admin, campaign.user_id);
  async function decryptKey(encrypted: string | null): Promise<string | null> {
    if (!encrypted || !ownerIsPro) return null;
    try {
      return await decryptValue(encrypted);
    } catch {
      return null;
    }
  }

  const [
    [campaignOpenai, campaignAnthropic, campaignGemini, campaignFalai],
    platformKeys,
    providerConfigs,
  ] = await Promise.all([
    Promise.all([
      decryptKey(campaign.openai_api_key),
      decryptKey(campaign.anthropic_api_key),
      decryptKey(campaign.gemini_api_key),
      decryptKey(campaign.falai_api_key),
    ]),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini", "falai"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini", "falai"]),
  ]);
  const openaiKey = campaignOpenai ?? platformKeys.openai ?? null;
  const anthropicKey = campaignAnthropic ?? platformKeys.anthropic ?? null;
  const geminiKey = campaignGemini ?? platformKeys.gemini ?? null;

  // Resolve the campaign's chosen image provider (openai / openai-mini / falai / gemini).
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    campaignKeys: {
      openai: campaignOpenai,
      falai: campaignFalai,
      gemini: campaignGemini,
    },
    platformKeys: {
      openai: platformKeys.openai,
      falai: platformKeys.falai,
      gemini: platformKeys.gemini,
    },
    providerConfigs,
  });

  // ── Determine provider + isByok before generating (needed for credit check) ──
  const textProvider = campaign.text_provider ?? "openai";

  const textIsByok =
    textProvider === "anthropic"
      ? !!campaignAnthropic
      : textProvider === "gemini"
        ? !!campaignGemini
        : !!campaignOpenai;
  const imageIsByok = img?.isByok ?? false;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const [baseTextCost, basePortraitCost] = await Promise.all([
    textIsByok ? Promise.resolve(0) : fetchCreditCost(admin, "npc_text"),
    imageIsByok || !generateImage || !img
      ? Promise.resolve(0)
      : fetchCreditCost(admin, "portrait"),
  ]);
  const textMultiplier =
    providerConfigs[textProvider as keyof typeof providerConfigs]
      ?.text_multiplier;
  const npcTextCost = applyMultiplier(baseTextCost, textMultiplier);
  // Portrait cost scales with output area vs a 1024² square baseline.
  const portraitSize = img
    ? (PORTRAIT_SIZE_BY_PROVIDER[img.base] ?? "1024x1536")
    : "1024x1536";
  const portraitCostEach = img
    ? Math.round(
        applyMultiplier(basePortraitCost, img.imageMultiplier) *
          sizeMultiplier(portraitSize) *
          100,
      ) / 100
    : 0;
  const maxImages = generateImage ? (generateAlterEgo ? 2 : 1) : 0;
  const totalNeeded = npcTextCost + portraitCostEach * maxImages;
  // Atomic affordability gate: hold the balance across the paid text+portrait calls.
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, totalNeeded, "npc_text");
  if (!reservation.ok) {
    return reservationFailureResponse(reservation, corsHeaders);
  }

  let textResult: TextResult;

  const systemContent =
    promptRow.content +
    buildCampaignContext(campaign.ai_setting_prompt) +
    INJECTION_GUARD_SUFFIX;

  const userContent = generateAlterEgo
    ? `${wrapUserInput(prompt)}\n\nThis NPC has a disguise identity — populate disguise_name and disguise_image_prompt.`
    : wrapUserInput(prompt);

  const textModel =
    providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  try {
    if (textProvider === "anthropic" && anthropicKey) {
      textResult = await anthropicText(
        anthropicKey,
        textModel ?? "claude-haiku-3-20240307",
        systemContent,
        userContent,
      );
    } else if (textProvider === "gemini" && geminiKey) {
      textResult = await geminiText(
        geminiKey,
        textModel ?? "gemini-2.5-flash",
        systemContent,
        userContent,
      );
    } else {
      if (!openaiKey) {
        await releaseCredits(admin, reservation.ids);
        return new Response("No OpenAI API key configured", { status: 422 });
      }
      textResult = await openaiText(
        openaiKey,
        textModel ?? "gpt-4o-mini",
        systemContent,
        userContent,
      );
    }
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("NPC text generation failed:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Text generation failed",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const npcData = JSON.parse(textResult.content);

  if (
    generateAlterEgo &&
    (!npcData.disguise_name || !npcData.disguise_image_prompt)
  ) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({
        error: "AI response was missing disguise fields — please try again.",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ── Image generation ────────────────────────────────────────────────────────
  let portrait_b64: string | null = null;
  let disguise_portrait_b64: string | null = null;
  let totalImageCount = 0;
  // Accumulate OpenAI image token usage across the generation + optional edit so
  // the ledger can compute the real, fully token-based image cost:
  //   • input_tokens       — text prompt tokens (text-input rate)
  //   • input_image_tokens — seed-image tokens on edit calls (image-input rate; the
  //     disguise edit feeds the generated portrait back in, which drives input up)
  //   • output_tokens      — generated-image tokens (image-output rate, dominant)
  // (fal.ai is flat-priced and reports no tokens — left at 0 → flat fallback.)
  let imgInputTokens = 0;
  let imgInputImageTokens = 0;
  let imgOutputTokens = 0;
  let imgResultProvider: string | null = null;

  if (img && generateImage && npcData.true_portrait_prompt) {
    const imagePrompt = buildLabelledImagePrompt({
      base: imageBasePrompt,
      setting: campaign.ai_setting_prompt ?? "",
      subject: String(npcData.true_portrait_prompt ?? "").slice(0, MAX_IMAGE_SUBJECT_CHARS),
    });

    try {
      const { b64, usage } = await generateImage({
        provider: img.provider,
        model: img.model,
        apiKey: img.apiKey,
        prompt: imagePrompt,
        size: portraitSize,
        quality: img.imageQuality,
        boostStyle: true,
      });
      portrait_b64 = b64;
      totalImageCount++;
      imgResultProvider = usage.provider;
      imgInputTokens += usage.input_tokens ?? 0;
      imgInputImageTokens += usage.input_image_tokens ?? 0;
      imgOutputTokens += usage.output_tokens ?? 0;
    } catch (e) {
      console.error("Portrait generation failed:", e);
      // non-fatal — continue without portrait
    }

    // Alter-ego disguise edits off the true-form portrait. fal.ai has no edit
    // endpoint and degrades to plain generate (loosely matches the prior skip).
    if (generateAlterEgo && portrait_b64 && npcData.disguise_image_prompt) {
      const disguisePrompt = buildSimpleImagePrompt({
        base: imageBasePrompt,
        setting: campaign.ai_setting_prompt ?? "",
        subject: String(npcData.disguise_image_prompt ?? "").slice(0, MAX_IMAGE_SUBJECT_CHARS),
      });
      try {
        const seedBytes = Uint8Array.from(atob(portrait_b64), (c) =>
          c.charCodeAt(0),
        );
        const seedBlob = new Blob([seedBytes], { type: "image/webp" });
        const { b64, usage } = await generateImage({
          provider: img.provider,
          model: img.model,
          apiKey: img.apiKey,
          prompt: disguisePrompt,
          size: portraitSize,
          quality: img.imageQuality,
          boostStyle: true,
          sourceImages: [seedBlob],
        });
        disguise_portrait_b64 = b64;
        totalImageCount++;
        imgResultProvider = usage.provider;
        imgInputTokens += usage.input_tokens ?? 0;
        imgInputImageTokens += usage.input_image_tokens ?? 0;
        imgOutputTokens += usage.output_tokens ?? 0;
      } catch (e) {
        console.error("Disguise portrait generation failed (non-fatal):", e);
      }
    }
  }

  // ── Record usage (deduct credits for platform-key, log-only for BYOK) ────────
  // Release the hold first; the records below carry the real charge + analytics.
  await releaseCredits(admin, reservation.ids);
  const recordPromises: Promise<void>[] = [
    recordGeneration(admin, user.id, "npc_text", textIsByok, npcTextCost, {
      model: textResult.usage.model,
      provider: textResult.usage.provider,
      input_tokens: textResult.usage.input_tokens,
      output_tokens: textResult.usage.output_tokens,
    }),
  ];
  if (totalImageCount > 0) {
    recordPromises.push(
      recordGeneration(
        admin,
        user.id,
        "portrait",
        imageIsByok,
        portraitCostEach * totalImageCount,
        {
          model: img!.model,
          provider: imgResultProvider ?? img!.provider,
          image_count: totalImageCount,
          input_tokens: imgInputTokens || undefined,
          input_image_tokens: imgInputImageTokens || undefined,
          output_tokens: imgOutputTokens || undefined,
        },
      ),
    );
  }
  await Promise.allSettled(recordPromises);

  // ── Return result ───────────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ ...npcData, portrait_b64, disguise_portrait_b64 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
