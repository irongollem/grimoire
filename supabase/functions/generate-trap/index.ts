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
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  MAX_IMAGE_SUBJECT_CHARS,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { buildSimpleImagePrompt } from "../_shared/image-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";

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
    .select("id, user_id, ai_enabled, text_provider, image_provider, ai_setting_prompt, ruleset, openai_api_key, anthropic_api_key, gemini_api_key")
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

  // Ruleset-aware generation (#564) — anything other than "2024" resolves to "2014".
  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";

  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["trap", "image_base", `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === "trap");
  const imageBasePrompt = promptRows?.find((r) => r.generator_type === "image_base")?.content ?? "";
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === `ruleset_context_${ruleset}`)?.content ?? null;
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

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

  const systemContent = promptRow.content + (rulesetContext ? `\n\n${rulesetContext}` : "") + buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

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
  // 1024×1536 → 1.5×). BYOK + multiplier come from the resolved image provider.
  const imageIsByok = img?.isByok ?? false;
  const trapImageCost = (generate_image && img && !imageIsByok)
    ? Math.round(
        applyMultiplier(await fetchCreditCost(admin, "entity_image"), img.imageMultiplier) *
        sizeMultiplier("1024x1536") * 100,
      ) / 100
    : 0;
  const trapTotalCost = trapCost + trapImageCost;
  // Atomic affordability gate: hold the balance across the paid text+image calls.
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, trapTotalCost, "trap_generation");
  if (!reservation.ok) {
    return reservationFailureResponse(reservation);
  }

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;

  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response(e.message, { status: 422 });
    }
    console.error("Trap text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const trapData = JSON.parse(textResult.content);

  // ── Image generation ─────────────────────────────────────────────────────
  let image_b64: string | null = null;
  let imgResult: Awaited<ReturnType<typeof generateImage>> | null = null;

  if (generate_image && img) {
    try {
      const imagePrompt = buildSimpleImagePrompt({
        base: imageBasePrompt,
        setting: campaign.ai_setting_prompt ?? "",
        subject: String(trapData.image_prompt ?? "").slice(0, MAX_IMAGE_SUBJECT_CHARS),
      });

      // With a party portrait, compose it into the scene (PARTY_SUFFIX explains
      // its role).
      let sourceImages: Blob[] | undefined;
      let finalPrompt = imagePrompt;
      // SSRF guard: only ever fetch our own Supabase Storage public URLs. An
      // unsafe URL is skipped (image block is non-fatal) rather than fetched.
      if (group_portrait_url && isSafeStorageUrl(group_portrait_url)) {
        const portraitRes = await fetch(group_portrait_url);
        if (!portraitRes.ok) throw new Error(`Failed to fetch portrait: ${portraitRes.status}`);
        sourceImages = [await portraitRes.blob()];
        finalPrompt = [imagePrompt, PARTY_SUFFIX].join(" — ");
      } else if (group_portrait_url) {
        console.warn("Rejected unsafe group_portrait_url — skipping party portrait");
      }

      imgResult = await generateImage({
        provider: img.provider, model: img.model, apiKey: img.apiKey,
        prompt: finalPrompt, size: "1024x1536", quality: img.imageQuality, boostStyle: true, sourceImages,
      });
      // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. No
      // server-side upload here (the client uploads image_b64), so this is
      // the last point the resolved provider/model are known.
      const imageProv: AiProvenance = {
        generatorType: "trap",
        provider: imgResult.usage.provider,
        model: img.model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };
      image_b64 = markGeneratedImageB64(imgResult.b64, imgResult.contentType, imageProv);
    } catch (e) {
      console.error("Trap image generation failed (non-fatal):", e);
    }
  }

  // Release the hold; record the real spend below (text always, image if it rendered).
  await releaseCredits(admin, reservation.ids);

  // Log text generation (with credit deduction)
  await recordGeneration(admin, user.id, "trap_generation", textIsByok, trapCost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  // Charge the illustration as its own entity_image row (or delta=0 on BYOK).
  if (imgResult) {
    await recordGeneration(admin, user.id, "entity_image", imageIsByok, trapImageCost, {
      model: img!.model, provider: imgResult.usage.provider, image_count: 1,
      input_tokens:       imgResult.usage.input_tokens       || undefined,
      input_image_tokens: imgResult.usage.input_image_tokens || undefined,
      output_tokens:      imgResult.usage.output_tokens      || undefined,
    });
  }

  const ai_provenance: AiProvenance = {
    generatorType: "trap_generation",
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({ ...trapData, image_b64, ai_provenance }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
