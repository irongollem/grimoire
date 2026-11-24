import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { isPromptRejected } from "../_shared/moderation.ts";
import {
  AI_PROMPT_LIMIT_LONG,
  INJECTION_GUARD_SUFFIX,
  MAX_IMAGE_SUBJECT_CHARS,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { buildEntityImagePrompt, buildImagePromptAuthorSystem, imageBoostFor } from "../_shared/image-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, resolveTextProvider, NO_TEXT_PROVIDER_MESSAGE } from "../_shared/textGen.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText, worldImageSetting } from "../_shared/worldBlock.ts";
import { lookReferenceBlobs } from "../_shared/lookReferenceBlobs.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

// Entity portraits always render portrait-orientation.
const ENTITY_IMAGE_SIZE = "1024x1536";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface EntityImageCampaign extends BaseCampaign {
  image_provider: string | null;
}

const optionalString = (v: unknown) => (typeof v === "string" && v ? v : undefined);

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = optionalString(body?.campaign_id);
  const kind = optionalString(body?.kind);
  const context = optionalString(body?.context);
  if (!campaign_id || !kind || !context) return jsonError(400, "invalid_body", "Need { campaign_id, kind, context }.");

  const promptCheck = validatePromptInput(context, AI_PROMPT_LIMIT_LONG);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<EntityImageCampaign>(admin, campaign_id, user.id, {
    columns: ["image_provider"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  const { data: imageBaseRow, error: imageBaseError } = await admin
    .from("ai_system_prompts").select("content")
    .eq("generator_type", "image_base").maybeSingle();
  if (imageBaseError) throw imageBaseError;
  const imageBasePrompt = imageBaseRow?.content ?? "";

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // Resolve the campaign's chosen image provider (openai / gemini).
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
    providerConfigs,
  });
  if (!img) return jsonError(422, "no_image_provider", "No image API key is configured.");

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // ── Everything that can be computed before paying ─────────────────────────
  const world = await loadWorldBlock(admin, campaign.id);
  // Entity portraits render at ENTITY_IMAGE_SIZE; cost scales with output area
  // (portrait = 1.5× a square render) and the chosen provider's multiplier.
  const baseCost = await fetchCreditCost(admin, "entity_image");
  const cost = wholeCredits(
    applyMultiplier(baseCost, img.imageMultiplier) * sizeMultiplier(ENTITY_IMAGE_SIZE),
  );
  const quality = await resolveImageQuality(admin, "entity_image", img);
  const systemContent =
    buildImagePromptAuthorSystem(kind) +
    worldBlockText(world) +
    INJECTION_GUARD_SUFFIX;
  const userContent = wrapUserInput(context);

  // Hold the balance across the paid text+image calls.
  return withCreditHold(admin, { payerId: user.id, reason: "entity_image", cost, report }, async (hold) => {
    // ── 1. Author a visual prompt from the entity's facts ────────────────────
    let textResult;
    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
        maxTokens: text.provider === "anthropic" ? 1024 : undefined,
        outputFormat: "text",
      });
    } catch (e) {
      console.error("Entity image prompt authoring failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Prompt authoring failed");
    }

    // Analytics-only row for the prompt-author text tokens (no extra deduction). Zero-cost on the platform, so the
    // hold writes it as a free line rather than dropping it.
    hold.charge("entity_image_prompt", {
      cost: 0,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    // Cap the model-authored subject so a coaxed long prompt can't inflate the
    // (token-priced) image call beyond what the credit cost assumes.
    const subject = textResult.content.trim().slice(0, MAX_IMAGE_SUBJECT_CHARS);
    if (!subject) {
      return jsonError(502, "generation_failed", "The AI did not return an image description. Nothing was charged; please try again.");
    }

    // ── 2. Render the image ──────────────────────────────────────────────────
    const imagePrompt = buildEntityImagePrompt(kind, {
      base: imageBasePrompt,
      setting: worldImageSetting(world),
      subject,
    });

    let imgResult;
    try {
      imgResult = await generateImage({
        provider: img.provider, model: img.model, apiKey: img.apiKey,
        screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "entity_image" },
        prompt: imagePrompt, size: ENTITY_IMAGE_SIZE, quality,
        boostStyle: imageBoostFor(kind),
        styleReferences: await lookReferenceBlobs(world.lookReferences),
      });
    } catch (e) {
      // A prompt the screen refused is the DM's to reword, not a provider
      // outage — 400 rather than 502, and no error log for an ordinary refusal.
      if (isPromptRejected(e)) return jsonError(400, "prompt_rejected", e.message);
      console.error("Entity image generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Image generation failed");
    }

    // Charge once for the image (delta = -cost) as soon as it exists, before the provenance mark. If
    // marking throws, the hold writes this charge as a free line.
    hold.charge("entity_image", {
      cost,
      log: {
        model: img.model, quality, size: ENTITY_IMAGE_SIZE,
        provider: imgResult.usage.provider, image_count: 1,
        input_tokens:       imgResult.usage.input_tokens       || undefined,
        input_image_tokens: imgResult.usage.input_image_tokens || undefined,
        output_tokens:      imgResult.usage.output_tokens      || undefined,
      },
    });

    // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. This
    // endpoint has no server-side upload (the client uploads image_b64), so
    // the response is the last point the resolved provider/model are known.
    const prov: AiProvenance = {
      generatorType: kind,
      provider: imgResult.usage.provider,
      model: img.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };
    return json({ image_b64: markGeneratedImageB64(imgResult.b64, imgResult.contentType, prov) });
  });
}));
