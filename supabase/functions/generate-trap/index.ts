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
import { gameSystemEdition, NO_RULES_SYSTEM_MESSAGE, rulesetContextKey } from "../_shared/gameSystem.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  MAX_IMAGE_SUBJECT_CHARS,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { buildSimpleImagePrompt } from "../_shared/image-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isSafeStorageUrl } from "../_shared/storage-url.ts";
import { markGeneratedImageB64 } from "../_shared/provenance/mark.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText, worldImageSetting } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PARTY_SUFFIX =
  "The adventuring party from the reference portrait are present in this scene — they are the ones triggering or suffering the trap.";

interface TrapCampaign extends BaseCampaign {
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
  const trap_type = optionalString(body.trap_type);
  const cr = optionalString(body.cr);
  const generate_image = body.generate_image !== false;
  const group_portrait_url = optionalString(body.group_portrait_url);

  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits or the owner's own provider key (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<TrapCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "image_provider", "game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Trap stat blocks are 5e (DCs, damage dice): a Generic campaign gets none (#934).
  if (!gameSystemEdition(campaign.game_system)) return jsonError(400, "no_rules_system", NO_RULES_SYSTEM_MESSAGE);
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["trap", "image_base", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "trap");
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

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // ── Costs, all read before the hold ────────────────────────────────────────
  // Charged as two ledger rows (below), so each is rounded up to a whole credit
  // on its own rather than rounding their sum.
  const trapCost = text.isByok ? 0 : wholeCredits(
    applyMultiplier(await fetchCreditCost(admin, "trap_generation"), text.textMultiplier),
  );
  // The illustration is its own charge, reusing the entity_image cost (portrait
  // 1024×1536 → 1.5×). BYOK + multiplier come from the resolved image provider.
  const imageIsByok = img?.isByok ?? false;
  const wantsImage = generate_image && img !== null;
  const trapImageCost = (wantsImage && !imageIsByok)
    ? wholeCredits(
        applyMultiplier(await fetchCreditCost(admin, "entity_image"), img!.imageMultiplier) *
        sizeMultiplier("1024x1536"),
      )
    : 0;
  const trapImageQuality = wantsImage ? await resolveImageQuality(admin, "entity_image", img!) : null;

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content + (rulesetContext ? `\n\n${rulesetContext}` : "") + worldBlockText(world) + INJECTION_GUARD_SUFFIX;
  const constraints: string[] = [];
  if (trap_type) constraints.push(`Trap Type: ${trap_type}`);
  if (cr) constraints.push(`CR: ${cr}`);
  const wrappedPrompt = wrapUserInput(prompt);
  const userContent = constraints.length ? `${wrappedPrompt}\n\nConstraints:\n${constraints.join("\n")}` : wrappedPrompt;

  // Hold the balance across the paid text + image calls; the hold is released
  // whatever happens inside, and only what succeeded is charged.
  return withCreditHold(admin, { payerId: user.id, reason: "trap_generation", cost: trapCost + trapImageCost, report }, async (hold) => {
    let textResult: TextResult;
    try {
      textResult = await callText({ text, model: text.config?.text_model, system: systemContent, user: userContent });
    } catch (e) {
      console.error("Trap text generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    let trapData: Record<string, unknown>;
    try {
      trapData = JSON.parse(textResult.content);
    } catch {
      return jsonError(502, "generation_failed", "The trap came back unreadable. Nothing was charged; please try again.");
    }

    hold.charge("trap_generation", {
      cost: trapCost,
      isByok: text.isByok,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    // ── Image generation (non-fatal: a trap without a picture is still a trap) ──
    let image_b64: string | null = null;
    if (wantsImage) {
      try {
        const imagePrompt = buildSimpleImagePrompt({
          base: imageBasePrompt,
          setting: worldImageSetting(world),
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

        const imgResult = await generateImage({
          provider: img!.provider, model: img!.model, apiKey: img!.apiKey,
          screening: { apiKey: img!.moderationKey, admin, userId: user.id, generationType: "trap_image" },
          prompt: finalPrompt, size: "1024x1536", quality: trapImageQuality!, boostStyle: true, sourceImages,
        });
        // The picture was made, so it is charged even if marking it fails below.
        hold.charge("entity_image", {
          cost: trapImageCost,
          isByok: imageIsByok,
          log: {
            model: img!.model, quality: trapImageQuality, size: "1024x1536",
            provider: imgResult.usage.provider, image_count: 1,
            input_tokens:       imgResult.usage.input_tokens       || undefined,
            input_image_tokens: imgResult.usage.input_image_tokens || undefined,
            output_tokens:      imgResult.usage.output_tokens      || undefined,
          },
        });
        // EU AI Act Art 50(2) — mark before the bytes leave this pipeline. No
        // server-side upload here (the client uploads image_b64), so this is
        // the last point the resolved provider/model are known.
        const imageProv: AiProvenance = {
          generatorType: "trap",
          provider: imgResult.usage.provider,
          model: img!.model,
          generatedAt: new Date().toISOString(),
          edited: false,
        };
        image_b64 = markGeneratedImageB64(imgResult.b64, imgResult.contentType, imageProv);
      } catch (e) {
        console.error("Trap image generation failed (non-fatal):", e);
      }
    }

    const ai_provenance: AiProvenance = {
      generatorType: "trap_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...trapData, image_b64, ai_provenance });
  });
}));
