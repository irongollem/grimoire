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
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
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
import type { AiProvenance } from "../_shared/provenance/types.ts";

/**
 * Retrieval-grounded AI quest-hook generator (#600).
 *
 * Text-only, like generate-encounter and generate-downtime: there is no
 * illustration step, so no `entity_image` charge and no image provider to
 * resolve.
 *
 * Quest generation was, until now, entirely client-side BYOK-only
 * (src/ai/useQuestGeneration.ts): the same "quest" system prompt + ruleset
 * context + campaign setting as here, but with zero visibility into the DM's
 * own NPCs, factions and locations — the model could only invent generic
 * names that never resolve to anything in the campaign. This function is the
 * server path, grounding hook generation in the campaign's real entities via
 * the same embed → RPC-retrieve → candidate-block shape generate-encounter
 * established for the bestiary (#595), applied to three entity types instead
 * of one.
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

// ── Text response contract ───────────────────────────────────────────────────

/**
 * One AI-generated quest hook. This function does not validate individual
 * hook fields — only that `hooks` itself is a non-empty array (see the parse
 * guard in the handler) — so this interface documents the expected shape
 * without being enforced against it. `npcs`/`locations`/`factions` are the
 * schema extension this function adds server-side (see
 * SCHEMA_EXTENSION_INSTRUCTION below); they are OPTIONAL on purpose — a hook
 * that weaves in none of the offered entities is still a valid hook, and
 * downstream (the client's hook-to-record resolver) must tolerate a missing
 * array rather than reject the hook for lacking one.
 */
interface QuestHookAiResult {
  title: string;
  summary: string;
  hook_description: string;
  objectives: string[];
  tags: string[];
  npcs?: string[];
  locations?: string[];
  factions?: string[];
}

interface QuestGenerationResult {
  hooks: QuestHookAiResult[];
}

// Appended to the system prompt server-side — the DB "quest" prompt row
// itself is not modified. Tells the model to extend its existing JSON schema
// with the three entity-reference arrays that make the candidate block
// (built in the handler below) actually useful downstream: without an
// explicit callout, a general-purpose "here are some names you can use"
// block tends to get treated as flavor rather than as fields the model is
// expected to echo back in a structured way the client can resolve by name.
const SCHEMA_EXTENSION_INSTRUCTION =
  "\n\nIn addition to the fields already described, each hook object must also include " +
  '"npcs", "locations", and "factions" arrays — plain string arrays of the exact names of ' +
  "every campaign entity that hook references. Use names from the offered entities below " +
  "where applicable, plus any new minor characters, places, or groups you invent for that " +
  "hook. Omit an array (or leave it empty) if a hook references nothing of that type.";

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

  let campaign_id: string, prompt: string;

  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    prompt      = body.prompt;
    if (!campaign_id || !prompt) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, prompt }", { status: 400 });
  }

  // AI_PROMPT_LIMIT (1000), not _SHORT (500): the panel composes several
  // lines into this one string (party level, an optional giver/location
  // constraint block, and up to a 500-char theme), so the ceiling has to fit
  // the whole composition, not just the theme field alone.
  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

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
    .in("generator_type", ["quest", `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === "quest");
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

  const systemContent = promptRow.content + SCHEMA_EXTENSION_INSTRUCTION +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, "quest_generation");
  const cost = applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  //
  // This MUST stay above the retrieval block below, not just above callText.
  // Retrieval makes its own billed embedding request, and because that
  // request is recorded at delta 0 it never touches the caller's balance —
  // so the reservation is not a second line of defence for it. Gate first,
  // embed after: otherwise any authenticated campaign member can loop this
  // endpoint and run up unbounded platform spend that no throttle and no
  // balance check ever sees. See generate-encounter for the same reasoning.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "quest_generation");
  if (!reservation.ok) return reservationFailureResponse(reservation);

  // ── Semantic retrieval (#600) ──────────────────────────────────────────────
  // An ENHANCEMENT, not a requirement: retrieval must never be able to take
  // quest generation down. A missing vendor, a mid-flip config, a provider
  // outage or an RPC error all cost grounding, not the feature — the whole
  // block is one try/catch whose failure path leaves the candidate arrays
  // empty and the prompt falls back to exactly what the client-side BYOK path
  // already sends (see useQuestGeneration.ts): the "quest" system prompt +
  // ruleset context + campaign setting, no entity block.
  let candidates: { npcs: CandidateEntity[]; locations: CandidateEntity[]; factions: CandidateEntity[] } =
    { npcs: [], locations: [], factions: [] };
  let retrievalOk = false;

  try {
    const embedProvider = await resolveEmbeddingProvider(admin, {
      openai: platformKeys.openai ?? null,
      gemini: platformKeys.gemini ?? null,
    });
    const { vectors, usage: embedUsage } = await embedProvider.embed([prompt]);

    // Recorded HERE, not after the RPCs below — real provider spend was
    // incurred the moment embed() returned, and everything after this point
    // can throw into the catch. Recording later would mean a transient DB
    // error silently converts real money into invisible spend. Platform-paid,
    // charged to nobody: is_byok stays false because we, not the user, paid
    // for it — see recordFreeGeneration's doc comment.
    await recordFreeGeneration(admin, user.id, "entity_embedding", {
      model:        embedProvider.model,
      provider:     embedUsage.provider,
      input_tokens: embedUsage.input_tokens,
    });

    candidates = await retrieveCampaignEntities(admin, {
      queryVector:    toVectorLiteral(vectors[0]),
      campaignId:     campaign_id,
      // The OWNER, not the caller — matching generate-encounter's bestiary
      // scoping. A campaign member generating a quest sees the DM's NPCs,
      // factions and locations, not their own (players don't have any).
      ownerId:        campaign.user_id,
      embeddingModel: embedProvider.model,
    });

    const totalCandidates = candidates.npcs.length + candidates.locations.length + candidates.factions.length;
    if (totalCandidates === 0) {
      // Not necessarily an error — a brand-new campaign legitimately has no
      // NPCs/locations/factions yet — but it means there is nothing to
      // ground the hooks in, so it is worth a look if it happens for a
      // long-running campaign that plainly has entities.
      console.warn(`Quest retrieval found zero campaign entities for campaign ${campaign_id} — building the prompt without the entity block.`);
    } else {
      retrievalOk = true;
    }
  } catch (e) {
    // Diagnosable, but never fatal.
    const why = e instanceof EmbeddingProviderConfigError
      ? `embedding provider not usable (${e.message})`
      : e instanceof Error ? e.message : "unknown error";
    console.warn(`Quest retrieval unavailable for campaign ${campaign_id}, falling back to the client-equivalent prompt: ${why}`);
    candidates = { npcs: [], locations: [], factions: [] };
  }

  // formatEntityBlock() only formats — whether to call it at all is decided
  // here, so a zero-candidate retrieval produces no prompt text at all
  // rather than an empty ---BEGIN/END--- shell.
  const entityBlock = retrievalOk ? formatEntityBlock(candidates, "writing hooks") : "";
  const userContent = `${wrapUserInput(prompt)}${entityBlock}`;

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;
  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
      // Five hooks' worth of title/summary/hook_description/objectives/tags
      // plus the npcs/locations/factions arrays this function adds to the
      // schema — several times the payload of generate-encounter's single
      // object, hence the larger budget than its 1200.
      maxTokens: 3000,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response("No OpenAI API key configured", { status: 422 });
    }
    console.error("Quest text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  let questData: QuestGenerationResult;
  try {
    questData = JSON.parse(textResult.content) as QuestGenerationResult;
  } catch {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed quest data — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!Array.isArray(questData.hooks) || questData.hooks.length === 0) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed quest data — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Release the hold; record the real spend (delta 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "quest_generation", textIsByok, cost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  const ai_provenance: AiProvenance = {
    generatorType: "quest_generation",
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({ ...questData, ai_provenance }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
