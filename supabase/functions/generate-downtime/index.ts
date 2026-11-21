import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import { currencyPromptBlock, loadCampaignCurrency } from "../_shared/currency.ts";
import { retrieveCampaignEntities, formatEntityBlock } from "../_shared/campaignEntityRetrieval.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

/**
 * Drafts the outcome of one downtime draw (#486, Phase 3).
 *
 * Text-only by design: the Interlude's activity cards render a procedural face
 * from `accent` + `glyph`, so there is no illustration to generate — which means
 * no `entity_image` charge, no image provider to resolve, and no remote-image
 * fetch (and therefore no SSRF surface) in this function.
 *
 * The returned shape mirrors a `DowntimeSeed`, so the client can feed it into
 * the existing resolve path unchanged rather than growing a parallel one.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface DowntimeCampaign extends BaseCampaign {
  text_provider: string | null;
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
  const activity_key = optionalString(body?.activity_key);
  const activity_title = optionalString(body?.activity_title);
  const reward_kind = optionalString(body?.reward_kind);
  if (!body || !campaign_id || !activity_key || !activity_title || !reward_kind) {
    return jsonError(400, "invalid_body", "Need { campaign_id, activity_key, activity_title, reward_kind }.");
  }
  const character_name = optionalString(body.character_name);
  // The DM's optional steer. Always a string so the prompt guard can run on it.
  const prompt = typeof body.prompt === "string" ? body.prompt : "";

  // The steer is optional, but if present it is untrusted user text like any other.
  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  // Only the DM resolves draws, so drafting an outcome is a DM-only act. A player
  // who is merely a campaign member must not be able to spend the owner's credits
  // here — hence owner-only, not the membership check the trap generator uses.
  const load = await loadAiCampaign<DowntimeCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "game_system"],
    access: "owner",
    forbiddenMessage: "Only the campaign's owner can draft a downtime outcome.",
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system; Generic has none.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["downtime", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "downtime");
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [[campaignOpenai, campaignAnthropic, campaignGemini], platformKeys, providerConfigs] = await Promise.all([
    loadCampaignKeys(admin, campaign, decryptValue).then((k) => [k.openai, k.anthropic, k.gemini] as const),
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent =
    promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) +
    INJECTION_GUARD_SUFFIX;

  // The archetype and reward kind are OUR values, not the caller's prose — they go
  // in as plain constraints. Only the DM's steer is wrapped as untrusted input.
  const constraints = [
    `Archetype: ${activity_title} (${activity_key})`,
    `reward.kind MUST be: ${reward_kind}`,
  ];
  if (character_name) constraints.push(`Character: ${character_name}`);

  // A gold effect's "gain" and "spend" are coin maps keyed by the campaign's denominations.
  let currencyBlock: string;
  try {
    currencyBlock = currencyPromptBlock(await loadCampaignCurrency(admin, campaign_id));
  } catch (e) {
    console.error("Downtime currency read failed:", e);
    return jsonError(500, "currency_read_failed", "Could not read the campaign's currency.");
  }

  const userContent = (prompt
    ? `${wrapUserInput(prompt)}\n\nConstraints:\n${constraints.join("\n")}`
    : `Draft the outcome.\n\nConstraints:\n${constraints.join("\n")}`) + currencyBlock;

  // The platform picks the model: a campaign on credits runs on the provider the
  // admin enabled, and campaigns.text_provider only counts with the campaign's own key.
  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, "downtime_generation");
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  // Throttle abusive burst volume before any paid provider work (issue #466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  return withCreditHold(admin, { payerId: user.id, reason: "downtime_generation", cost, report }, async (hold) => {
    // ── Semantic retrieval (#600 — the fourth grounded generator) ────────────
    // An ENHANCEMENT, not a requirement, same contract as generate-quest /
    // generate-roll-table / generate-chronicle-text: any failure drops the
    // block and the prompt degrades to exactly the pre-#600 behavior. Sits
    // after the rate-limit + reservation gates for the same
    // unbounded-embed-spend reason generate-quest documents.
    //
    // Grounding is INPUT-side only, like the Chronicler: the outcome's
    // vignette is prose and its reward entity is net-new by design
    // (npcInsertFromSeed creates a fresh NPC), so nothing resolves back to
    // rows and no chip surface exists. Offering the campaign's real shops,
    // contacts and locations lets the vignette weave them in by exact name.
    //
    // The DM's steer is optional and usually empty, so the semantic query is
    // composed from what always exists: the activity archetype and character,
    // plus the steer when present — "Carousing — Wilhelm" retrieves taverns
    // and drinking companions even with no steer at all.
    let entityBlock = "";
    try {
      const embedProvider = await resolveEmbeddingProvider(admin, {
        openai: platformKeys.openai ?? null,
        gemini: platformKeys.gemini ?? null,
      });
      const query = [activity_title, character_name, prompt].filter(Boolean).join(" — ");
      const { vectors, usage: embedUsage } = await embedProvider.embed([query]);

      // Queued HERE — real provider spend was incurred the moment embed()
      // returned; everything after this point can throw into the catch, and a
      // free line is written whatever the work does.
      hold.free("entity_embedding", {
        model:        embedProvider.model,
        provider:     embedUsage.provider,
        input_tokens: embedUsage.input_tokens,
      });

      const candidates = await retrieveCampaignEntities(admin, {
        queryVector:    toVectorLiteral(vectors[0]),
        campaignId:     campaign_id,
        // Owner and caller are the same user here (owner-only gate above), so
        // unlike the sibling generators there is no owner-vs-caller nuance.
        ownerId:        campaign.user_id,
        embeddingModel: embedProvider.model,
      });
      if (candidates.npcs.length + candidates.locations.length + candidates.factions.length > 0) {
        entityBlock = formatEntityBlock(candidates, "drafting the outcome");
      }
    } catch (e) {
      // Diagnosable, but never fatal.
      const why = e instanceof EmbeddingProviderConfigError
        ? `embedding provider not usable (${e.message})`
        : e instanceof Error ? e.message : "unknown error";
      console.warn(`Downtime retrieval unavailable for campaign ${campaign_id}, falling back to the ungrounded prompt: ${why}`);
      entityBlock = "";
    }
    const groundedUserContent = `${userContent}${entityBlock}`;

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: groundedUserContent,
      });
    } catch (e) {
      console.error("Downtime outcome generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    let outcome: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(textResult.content);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      outcome = parsed as Record<string, unknown>;
    } catch {
      return jsonError(502, "generation_failed", "The outcome came back unreadable. Nothing was charged; please try again.");
    }

    // Charged the moment the paid call has produced a usable result (delta 0 on BYOK).
    hold.charge("downtime_generation", {
      cost,
      isByok: text.isByok,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    const ai_provenance: AiProvenance = {
      generatorType: "downtime_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...outcome, ai_provenance });
  });
}));
