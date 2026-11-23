import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { fetchCreditCost, sizeMultiplier, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imageGen.ts";
import { resolveImageQuality } from "../_shared/imageQuality.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  MAX_IMAGE_SUBJECT_CHARS,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { buildSimpleImagePrompt } from "../_shared/image-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, resolveTextProvider, NO_TEXT_PROVIDER_MESSAGE, type TextResult } from "../_shared/textGen.ts";
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

const MAP_BASE_PROMPT =
  "Top-down fantasy cartography map. Hand-drawn ink style, bird's-eye view, clean linework, labeled zones, hatching for walls and elevation, minimal colour. Readable as a functional map, not a painting.";

interface LocationCampaign extends BaseCampaign {
  text_provider: string | null;
  image_provider: string | null;
  game_system: string | null;
}

const optionalString = (v: unknown) => (typeof v === "string" && v ? v : undefined);

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate — including BYOK, which skips
  // the credit gate for both (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = optionalString(body?.campaign_id);
  const prompt = optionalString(body?.prompt);
  if (!body || !campaign_id || !prompt) return jsonError(400, "invalid_body", "Need { campaign_id, prompt }.");
  const location_type = optionalString(body.location_type);
  const parent_name = optionalString(body.parent_name);
  const generate_image = body.generate_image !== false;
  const generate_map = body.generate_map === true;

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits or the owner's own provider key (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<LocationCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "image_provider", "game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system; Generic has none.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["location", "image_base", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "location");
  const imageBasePrompt = promptRows?.find((r) => r.generator_type === "image_base")?.content ?? "";
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.anthropic, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  // Resolve the campaign's chosen image provider (openai / gemini).
  const img = resolveImageProvider({
    imageProvider: campaign.image_provider,
    campaignKeys: { openai: campaignOpenai, gemini: campaignGemini },
    platformKeys: { openai: platformKeys.openai, gemini: platformKeys.gemini },
    providerConfigs,
  });

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content + (rulesetContext ? `\n\n${rulesetContext}` : "") + worldBlockText(world) + INJECTION_GUARD_SUFFIX;

  const constraints: string[] = [];
  if (location_type) constraints.push(`Location Type: ${location_type}`);
  if (parent_name) constraints.push(`Parent Location: ${parent_name}`);
  const wrappedPrompt = wrapUserInput(prompt);
  const userContent = constraints.length ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}` : wrappedPrompt;

  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseLocationCost = text.isByok ? 0 : await fetchCreditCost(admin, "location_generation");
  // Each recorded as its own ledger row (below), so each is rounded up to a
  // whole credit on its own rather than rounding their sum.
  const locationCost = wholeCredits(
    applyMultiplier(baseLocationCost, text.textMultiplier),
  );
  // The scene and map are each their own charge, reusing the entity_image cost
  // (square 1024×1024 → 1.0×). BYOK + multiplier come from the resolved image provider.
  const imageIsByok = img?.isByok ?? false;
  const baseImageCost = (img && !imageIsByok) ? await fetchCreditCost(admin, "entity_image") : 0;
  const perImageCost = img
    ? wholeCredits(applyMultiplier(baseImageCost, img.imageMultiplier) * sizeMultiplier("1024x1024"))
    : 0;
  const locationTotalCost = locationCost + (generate_image ? perImageCost : 0) + (generate_map ? perImageCost : 0);
  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // Both the scene and the map bill against "entity_image", so they share one
  // resolved quality. Read before the hold: an awaited read that throws must not strand a reservation.
  const imageQuality = img ? await resolveImageQuality(admin, "entity_image", img) : null;

  // Hold the balance across the paid text+image calls; the hold is released whatever happens inside, and only
  // what succeeded is charged.
  return withCreditHold(admin, { payerId: user.id, reason: "location_generation", cost: locationTotalCost, report }, async (hold) => {
    let textResult: TextResult;

    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
      });
    } catch (e) {
      console.error("Location text generation failed:", e);
      return jsonError(502, "generation_failed", "Text generation failed. Nothing was charged; please try again.");
    }

    let locationData: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(textResult.content);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      locationData = parsed as Record<string, unknown>;
    } catch {
      return jsonError(502, "generation_failed", "The location came back unreadable. Nothing was charged; please try again.");
    }

    // Log text generation (with credit deduction), the moment it has produced a usable result.
    hold.charge("location_generation", {
      cost: locationCost,
      isByok: text.isByok,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    // ── Images in parallel ──────────────────────────────────────────────────
    let image_b64: string | null = null;
    let map_b64: string | null = null;

    if (img && (generate_image || generate_map)) {
      const [imgSettled, mapSettled] = await Promise.allSettled([
        generate_image
          ? generateImage({
              provider: img.provider, model: img.model, apiKey: img.apiKey,
              screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "location_scene" },
              prompt: buildSimpleImagePrompt({
                base: imageBasePrompt,
                setting: worldImageSetting(world),
                subject: String(locationData.image_prompt ?? "").slice(0, MAX_IMAGE_SUBJECT_CHARS),
              }),
              size: "1024x1024", quality: imageQuality, boostStyle: true,
              // The scene follows the look; the map below deliberately gets no references (top-down cartography).
              styleReferences: await lookReferenceBlobs(world.lookReferences),
            })
          : Promise.resolve(null),
        generate_map
          ? generateImage({
              provider: img.provider, model: img.model, apiKey: img.apiKey,
              screening: { apiKey: img.moderationKey, admin, userId: user.id, generationType: "location_map" },
              prompt: [MAP_BASE_PROMPT, String(locationData.map_prompt ?? "").slice(0, MAX_IMAGE_SUBJECT_CHARS)].filter(Boolean).join(" — "),
              size: "1024x1024", quality: imageQuality,
            })
          : Promise.resolve(null),
      ]);

      // Charge each image as its own entity_image row (or delta=0 on BYOK), as soon as it rendered and before the
      // provenance mark below: a picture that was made is paid for even if marking it then throws.
      for (const settled of [imgSettled, mapSettled]) {
        if (settled.status !== "fulfilled" || !settled.value) continue;
        const result = settled.value;
        hold.charge("entity_image", {
          cost: perImageCost,
          isByok: imageIsByok,
          log: {
            model: img.model, quality: imageQuality, size: "1024x1024",
            provider: result.usage.provider, image_count: 1,
            input_tokens:       result.usage.input_tokens       || undefined,
            input_image_tokens: result.usage.input_image_tokens || undefined,
            output_tokens:      result.usage.output_tokens      || undefined,
          },
        });
      }

      // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. No
      // server-side upload here (the client uploads image_b64/map_b64), so this
      // is the last point the resolved provider/model are known. A legal step:
      // if marking throws, the hold writes the queued charges as free lines.
      if (imgSettled.status === "fulfilled" && imgSettled.value) {
        const prov: AiProvenance = {
          generatorType: "location",
          provider: imgSettled.value.usage.provider,
          model: img.model,
          generatedAt: new Date().toISOString(),
          edited: false,
        };
        image_b64 = markGeneratedImageB64(imgSettled.value.b64, imgSettled.value.contentType, prov);
      } else if (imgSettled.status === "rejected") {
        console.error("Location scene image failed (non-fatal):", imgSettled.reason);
      }

      if (mapSettled.status === "fulfilled" && mapSettled.value) {
        const prov: AiProvenance = {
          generatorType: "location_map",
          provider: mapSettled.value.usage.provider,
          model: img.model,
          generatedAt: new Date().toISOString(),
          edited: false,
        };
        map_b64 = markGeneratedImageB64(mapSettled.value.b64, mapSettled.value.contentType, prov);
      } else if (mapSettled.status === "rejected") {
        console.error("Location map image failed (non-fatal):", mapSettled.reason);
      }
    }

    const ai_provenance: AiProvenance = {
      generatorType: "location_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...locationData, image_b64, map_b64, ai_provenance });
  });
}));
