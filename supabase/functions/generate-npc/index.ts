import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import {
  fetchProviderConfigs,
  applyMultiplier,
} from "../_shared/provider-config.ts";
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  MAX_IMAGE_SUBJECT_CHARS,
  validatePromptInput,
} from "../_shared/ai-prompt.ts";
import { formatNpcUserInput, NPC_CONTEXT_LIMIT } from "../_shared/npcPrompt.ts";
import {
  buildLabelledImagePrompt,
  buildSimpleImagePrompt,
} from "../_shared/image-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText, worldImageSetting } from "../_shared/worldBlock.ts";
import { lookReferenceBlobs } from "../_shared/lookReferenceBlobs.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface NpcCampaign extends BaseCampaign {
  text_provider: string | null;
  image_provider: string | null;
  game_system: string | null;
}

// Portrait render size per image provider — drives the area-based cost multiplier.
const PORTRAIT_SIZE_BY_PROVIDER: Record<string, string> = {
  openai: "1024x1536",
  gemini: "1024x1536",
};

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate — including BYOK, which skips
  // the credit gate for both (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  // ── Parse body ──────────────────────────────────────────────────────────────
  const body = await readJsonBody(req);
  const campaign_id = typeof body?.campaign_id === "string" && body.campaign_id ? body.campaign_id : null;
  const prompt = typeof body?.prompt === "string" && body.prompt ? body.prompt : null;
  if (!body || !campaign_id || !prompt) return jsonError(400, "invalid_body", "Need { campaign_id, prompt }.");
  const generateAlterEgo = body.generate_alter_ego === true;
  const shouldGenerateImage = body.generate_image !== false;

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (context.length > NPC_CONTEXT_LIMIT) {
    return jsonError(400, "invalid_context", `NPC context exceeds the ${NPC_CONTEXT_LIMIT}-character limit.`);
  }

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits or the owner's own provider key (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<NpcCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "image_provider", "game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system; Generic has none.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  // ── Fetch system prompts from DB ────────────────────────────────────────────
  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts")
    .select("generator_type, content")
    .in("generator_type", ["npc", "image_base", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "npc");
  const imageBasePrompt =
    promptRows?.find((r) => r.generator_type === "image_base")?.content ?? "";
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [
    [campaignOpenai, campaignAnthropic, campaignGemini],
    platformKeys,
    providerConfigs,
  ] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.anthropic, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  // Resolve the campaign's chosen image provider (openai / gemini).
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    campaignKeys: {
      openai: campaignOpenai,
      gemini: campaignGemini,
    },
    platformKeys: {
      openai: platformKeys.openai,
      gemini: platformKeys.gemini,
    },
    providerConfigs,
  });

  // The platform decides the text model: a campaign on platform credits runs on
  // whichever provider the admin enabled, and `campaign.text_provider` only counts
  // when the campaign holds its own key for it. Refuse before anything is spent.
  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);
  const imageIsByok = img?.isByok ?? false;

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // ── Costs, all read before the hold ─────────────────────────────────────────
  const [baseTextCost, basePortraitCost] = await Promise.all([
    text.isByok ? Promise.resolve(0) : fetchCreditCost(admin, "npc_text"),
    imageIsByok || !shouldGenerateImage || !img
      ? Promise.resolve(0)
      : fetchCreditCost(admin, "portrait"),
  ]);
  const textMultiplier = text.textMultiplier;
  // npcTextCost and portraitCostEach are each recorded as their own ledger row
  // (below) — portraitCostEach again per image via `* totalImageCount` — so
  // each is rounded up to a whole credit per unit, not as part of a summed total.
  const npcTextCost = wholeCredits(applyMultiplier(baseTextCost, textMultiplier));
  // Portrait cost scales with output area vs a 1024² square baseline.
  const portraitSize = img
    ? (PORTRAIT_SIZE_BY_PROVIDER[img.base] ?? "1024x1536")
    : "1024x1536";
  const portraitCostEach = img
    ? wholeCredits(applyMultiplier(basePortraitCost, img.imageMultiplier) * sizeMultiplier(portraitSize))
    : 0;
  const maxImages = shouldGenerateImage ? (generateAlterEgo ? 2 : 1) : 0;
  const totalNeeded = npcTextCost + portraitCostEach * maxImages;
  const world = await loadWorldBlock(admin, campaign.id);
  // "portrait" is the cost row both the true and disguise renders bill
  // against, so they share one resolved quality too.
  const portraitQuality = img ? await resolveImageQuality(admin, "portrait", img) : null;

  const systemContent =
    promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) +
    INJECTION_GUARD_SUFFIX;

  const userContent = formatNpcUserInput(prompt, context, generateAlterEgo);

  const textModel = text.config?.text_model;

  // Hold the balance across the paid text + portrait calls; the hold is released
  // whatever happens inside, and only what succeeded is charged.
  return withCreditHold(admin, { payerId: user.id, reason: "npc_text", cost: totalNeeded, report }, async (hold) => {
    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: textModel,
        system: systemContent,
        user: userContent,
      });
    } catch (e) {
      console.error("NPC text generation failed:", e);
      return jsonError(502, "generation_failed", "Text generation failed. Nothing was charged; please try again.");
    }

    let npcData: Record<string, unknown> | null;
    try {
      npcData = JSON.parse(textResult.content);
    } catch {
      npcData = null;
    }
    if (npcData === null || typeof npcData !== "object" || Array.isArray(npcData)) {
      return jsonError(502, "generation_failed", "The NPC came back unreadable. Nothing was charged; please try again.");
    }

    if (generateAlterEgo && (!npcData.disguise_name || !npcData.disguise_image_prompt)) {
      return jsonError(502, "generation_failed", "The AI response was missing disguise fields. Nothing was charged; please try again.");
    }

    hold.charge("npc_text", {
      cost: npcTextCost,
      isByok: text.isByok,
      log: {
        model: textResult.usage.model,
        provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens,
        output_tokens: textResult.usage.output_tokens,
      },
    });

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
    let imgInputTokens = 0;
    let imgInputImageTokens = 0;
    let imgOutputTokens = 0;
    let imgResultProvider: string | null = null;

    if (img && shouldGenerateImage && npcData.true_portrait_prompt) {
      const lookRefs = await lookReferenceBlobs(world.lookReferences);
      const imagePrompt = buildLabelledImagePrompt({
        base: imageBasePrompt,
        setting: worldImageSetting(world),
        subject: String(npcData.true_portrait_prompt ?? "").slice(0, MAX_IMAGE_SUBJECT_CHARS),
      });

      try {
        const { b64, contentType, usage } = await generateImage({
          provider: img.provider,
          model: img.model,
          apiKey: img.apiKey,
          screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "npc_portrait" },
          prompt: imagePrompt,
          size: portraitSize,
          quality: portraitQuality,
          boostStyle: "portrait",
          styleReferences: lookRefs,
        });
        totalImageCount++;
        imgResultProvider = usage.provider;
        imgInputTokens += usage.input_tokens ?? 0;
        imgInputImageTokens += usage.input_image_tokens ?? 0;
        imgOutputTokens += usage.output_tokens ?? 0;
        // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. No
        // server-side upload here (the client uploads portrait_b64), so the
        // response is the last point the resolved provider/model are known.
        const prov: AiProvenance = {
          generatorType: "npc_portrait",
          provider: usage.provider,
          model: img.model,
          generatedAt: new Date().toISOString(),
          edited: false,
        };
        portrait_b64 = markGeneratedImageB64(b64, contentType, prov);
      } catch (e) {
        console.error("Portrait generation failed:", e);
        // non-fatal — continue without portrait
      }

      // Alter-ego disguise edits off the true-form portrait.
      if (generateAlterEgo && portrait_b64 && npcData.disguise_image_prompt) {
        const disguisePrompt = buildSimpleImagePrompt({
          base: imageBasePrompt,
          setting: worldImageSetting(world),
          subject: String(npcData.disguise_image_prompt ?? "").slice(0, MAX_IMAGE_SUBJECT_CHARS),
        });
        try {
          const seedBytes = Uint8Array.from(atob(portrait_b64), (c) =>
            c.charCodeAt(0),
          );
          const seedBlob = new Blob([seedBytes], { type: "image/webp" });
          const { b64, contentType, usage } = await generateImage({
            provider: img.provider,
            model: img.model,
            apiKey: img.apiKey,
            screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "npc_disguise_portrait" },
            prompt: disguisePrompt,
            size: portraitSize,
            quality: portraitQuality,
            boostStyle: "portrait",
            sourceImages: [seedBlob],
            styleReferences: lookRefs,
          });
          totalImageCount++;
          imgResultProvider = usage.provider;
          imgInputTokens += usage.input_tokens ?? 0;
          imgInputImageTokens += usage.input_image_tokens ?? 0;
          imgOutputTokens += usage.output_tokens ?? 0;
          // EU AI Act Art 50(2) — mark before the bytes leave this pipeline.
          const disguiseProv: AiProvenance = {
            generatorType: "npc_disguise",
            provider: usage.provider,
            model: img.model,
            generatedAt: new Date().toISOString(),
            edited: false,
          };
          disguise_portrait_b64 = markGeneratedImageB64(b64, contentType, disguiseProv);
        } catch (e) {
          console.error("Disguise portrait generation failed (non-fatal):", e);
        }
      }
    }

    if (totalImageCount > 0) {
      hold.charge("portrait", {
        cost: portraitCostEach * totalImageCount,
        isByok: imageIsByok,
        log: {
          model: img!.model,
          quality: portraitQuality,
          provider: imgResultProvider ?? img!.provider,
          image_count: totalImageCount,
          input_tokens: imgInputTokens || undefined,
          input_image_tokens: imgInputImageTokens || undefined,
          output_tokens: imgOutputTokens || undefined,
        },
      });
    }

    const ai_provenance: AiProvenance = {
      generatorType: "npc_text",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...npcData, portrait_b64, disguise_portrait_b64, ai_provenance });
  });
}));
