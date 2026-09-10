import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  reservationFailureResponse,
  recordFreeGeneration,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { INJECTION_GUARD_SUFFIX, wrapUserInput } from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { isAccountSuspended, suspendedResponse } from "../_shared/suspension.ts";
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";
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

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const parsedBody = parseQuestDesignTurnBody(rawBody);
  if (!parsedBody.ok) {
    return new Response(
      JSON.stringify({ error: parsedBody.reason }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const { campaign_id, prose, turn, tree, answers } = parsedBody.body;

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, openai_api_key, anthropic_api_key, gemini_api_key")
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
    .in("generator_type", ["quest_designer", `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === "quest_designer");
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

  const systemContent = promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, "quest_design_turn");
  const cost = applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);

  // Throttle abusive burst volume before any paid provider work (issue #466) —
  // same shared bucket as every other generator, gated ahead of retrieval for
  // the same reason generate-quest gates ahead of it (see that function's
  // comment): retrieval's embedding spend is recorded at delta 0 and so is
  // invisible to the balance check, making the rate limit the only guard.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "quest_design_turn");
  if (!reservation.ok) return reservationFailureResponse(reservation);

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
    await recordFreeGeneration(admin, user.id, "entity_embedding", {
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

  // The one place `??` is the right call: `fast_text_model` is an explicit
  // nullable column meaning "fall back to text_model", not an absent value
  // being silenced.
  const providerConfig = providerConfigs[textProvider as keyof typeof providerConfigs];
  const textModel = providerConfig?.fast_text_model ?? providerConfig?.text_model;

  let textResult: TextResult;
  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
      maxTokens: 5000,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response("No OpenAI API key configured", { status: 422 });
    }
    console.error("Quest design text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  let outputData: unknown;
  try {
    outputData = JSON.parse(textResult.content);
  } catch {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed design data — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const sanitized = sanitizeQuestDesignOutput(outputData);
  if (!sanitized) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed design data — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Release the hold; record the real spend (delta 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "quest_design_turn", textIsByok, cost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  const ai_provenance: AiProvenance = {
    generatorType: "quest_design",
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({
      tree: sanitized.tree,
      questions: sanitized.questions,
      note: sanitized.note,
      turn,
      turns_left: QUEST_DESIGN_TURN_BUDGET - turn,
      ai_provenance,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
