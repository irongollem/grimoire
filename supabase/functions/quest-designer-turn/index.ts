import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { INJECTION_GUARD_SUFFIX, wrapUserInput } from "../_shared/ai-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import {
  retrieveCampaignEntities,
  formatEntityBlock,
  type CandidateEntity,
} from "../_shared/campaignEntityRetrieval.ts";
import {
  QUEST_DESIGN_TURN_BUDGET,
  parseQuestDesignTurnBody,
  buildQuestDesignerUserContent,
  sanitizeQuestDesignOutput,
} from "../_shared/questDesigner.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

/**
 * Quest Designer, per-exchange turn (#873): a conversational, multi-turn beat
 * -tree design flow. The DM writes prose describing a quest; each call to
 * this function is one turn — the model proposes or revises the whole tree
 * (the #822 `QuestHookResult` shape) and, where a fork is genuinely
 * ambiguous, asks back rather than guessing or flattening it.
 *
 * STATELESS by design (#823's conclusion): nothing here holds a conversation.
 * The client sends the prose, the previous turn's tree (null on turn 1), and
 * every answer given so far; this function re-sends all of it to the model
 * every turn and returns the full revised tree plus any remaining questions.
 * `turn` is 1-based and capped at `QUEST_DESIGN_TURN_BUDGET` (10) per
 * sitting, enforced here rather than trusted from the client.
 *
 * Uses `provider_config.fast_text_model` (falling back to `text_model`) —
 * the DM is waiting on each exchange rather than once per quest, so latency
 * matters more here than for a one-shot generator like generate-quest, whose
 * pipeline (auth, credits, retrieval, provider dispatch) this function
 * otherwise mirrors exactly.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface QuestDesignCampaign extends BaseCampaign {
  game_system: string | null;
}

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  // `parseQuestDesignTurnBody` validates the shape itself; a body that is not JSON reaches it as null.
  const rawBody = await readJsonBody(req);
  if (rawBody === null) return jsonError(400, "invalid_body", "Invalid JSON body.");
  const parsedBody = parseQuestDesignTurnBody(rawBody);
  if (!parsedBody.ok) return jsonError(400, "invalid_body", parsedBody.reason);
  const { campaign_id, prose, turn, tree, answers } = parsedBody.body;

  // DMs only: this reads DM-only campaign content with the service role (see
  // _shared/campaignAccess.ts for why a player member must not get through).
  const load = await loadAiCampaign<QuestDesignCampaign>(admin, campaign_id, user.id, {
    columns: ["game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system; Generic has none.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["quest_designer", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "quest_designer");
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  // The platform decides the text model: the first provider the admin enabled. Refuse before anything is spent.
  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = await fetchCreditCost(admin, "quest_design_turn");
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  // Throttle abusive burst volume before any paid provider work (issue #466) —
  // same shared bucket as every other generator, gated ahead of retrieval for
  // the same reason generate-quest gates ahead of it (see that function's
  // comment): retrieval's embedding spend is recorded at delta 0 and so is
  // invisible to the balance check, making the rate limit the only guard.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) + INJECTION_GUARD_SUFFIX;

  // The one place `??` is the right call: `fast_text_model` is an explicit
  // nullable column meaning "fall back to text_model", not an absent value
  // being silenced.
  const textModel = text.config?.fast_text_model ?? text.config?.text_model;

  return withCreditHold(admin, { payerId: user.id, reason: "quest_design_turn", cost, report }, async (hold) => {
    // ── Semantic retrieval (#600 shape, same as generate-quest) ────────────────
    // An ENHANCEMENT, not a requirement — see generate-quest's identical block
    // for the full reasoning. A missing vendor, a mid-flip config, a provider
    // outage or an RPC error all cost grounding, not the turn.
    let candidates: { npcs: CandidateEntity[]; locations: CandidateEntity[]; factions: CandidateEntity[] } =
      { npcs: [], locations: [], factions: [] };
    let retrievalOk = false;

    try {
      const embedProvider = await resolveEmbeddingProvider(admin, {
        openai: platformKeys.openai ?? null,
        gemini: platformKeys.gemini ?? null,
      });
      const { vectors, usage: embedUsage } = await embedProvider.embed([prose]);

      // Platform-paid, charged to nobody — see recordFreeGeneration's doc
      // comment. Recorded before the RPCs below: real provider spend was
      // incurred the moment embed() returned.
      hold.free("entity_embedding", {
        model:        embedProvider.model,
        provider:     embedUsage.provider,
        input_tokens: embedUsage.input_tokens,
      });

      candidates = await retrieveCampaignEntities(admin, {
        queryVector:    toVectorLiteral(vectors[0]),
        campaignId:     campaign_id,
        // The OWNER, not the caller — matching generate-quest's scoping. A
        // campaign member designing a quest sees the DM's NPCs, factions and
        // locations, not their own (players don't have any).
        ownerId:        campaign.user_id,
        embeddingModel: embedProvider.model,
      });

      const totalCandidates = candidates.npcs.length + candidates.locations.length + candidates.factions.length;
      if (totalCandidates > 0) retrievalOk = true;
    } catch (e) {
      const why = e instanceof EmbeddingProviderConfigError
        ? `embedding provider not usable (${e.message})`
        : e instanceof Error ? e.message : "unknown error";
      console.warn(`Quest design retrieval unavailable for campaign ${campaign_id}: ${why}`);
      candidates = { npcs: [], locations: [], factions: [] };
    }

    const entityBlock = retrievalOk ? formatEntityBlock(candidates, "designing this quest") : "";
    const userContent = buildQuestDesignerUserContent(
      { prose, entityBlock, turn, tree, answers },
      wrapUserInput,
    );

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: textModel,
        system: systemContent,
        user: userContent,
        // The whole tree comes back every turn: up to 12 beats, each with a
        // paragraph of guidance and its rumor and reveal copy, plus questions.
        // Raised from 5000 when the player copy joined the beat.
        maxTokens: 6000,
      });
    } catch (e) {
      console.error("Quest design text generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    const malformed = () =>
      jsonError(502, "generation_failed", "The AI returned malformed design data. Nothing was charged; please try again.");
    let outputData: unknown;
    try {
      outputData = JSON.parse(textResult.content);
    } catch {
      return malformed();
    }

    const sanitized = sanitizeQuestDesignOutput(outputData);
    if (!sanitized) return malformed();

    hold.charge("quest_design_turn", {
      cost,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    const ai_provenance: AiProvenance = {
      generatorType: "quest_design",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({
      tree: sanitized.tree,
      questions: sanitized.questions,
      note: sanitized.note,
      turn,
      turns_left: QUEST_DESIGN_TURN_BUDGET - turn,
      ai_provenance,
    });
  });
}));
