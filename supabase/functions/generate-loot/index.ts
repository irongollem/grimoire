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
import { retrieveLootItems, formatItemBlock, type CandidateItem } from "../_shared/itemRetrieval.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";

/**
 * Retrieval-grounded AI loot-table generator (#602).
 *
 * Text-only, like generate-quest and generate-roll-table: no illustration
 * step, so no `entity_image` charge and no image provider to resolve.
 *
 * Unlike every other grounded generator, this one has no ungrounded ancestor
 * to fall back to conceptually — #600 nominated loot as the first generator to
 * ground and then discovered there was no loot generator at all. So it is
 * grounded from day one and SERVER-PATH ONLY: there is no client-side BYOK
 * twin, because BYOK-local is a legacy tier and new AI features do not ship a
 * second, weaker path for it (see the comment in useQuestGeneration.ts).
 *
 * The retrieval it does is also the first that is not purely semantic. See
 * _shared/itemRetrieval.ts for why a rarity/attunement band has to be a WHERE
 * predicate rather than a post-filter.
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

// Local copy of src/types/lootTable.types.ts's LOOT_CR_TIERS / RARITIES_BY_TIER
// — edge functions don't import from src/, so the tiers and their rarity bands
// are duplicated here (same arrangement as generate-roll-table's DIE_MAX).
// Keep both sides in step: the client shows the DM which rarities a tier
// covers, this copy is what actually filters retrieval.
//
// The bands overlap on purpose. A tier is "what this hoard should mostly be
// made of", not a hard level gate — an uncommon item is still a fine find at
// CR 15, and a rare one is a memorable (not broken) prize at CR 6. What the
// bands do rule out is the mismatch that makes generated loot useless: a
// legendary in a CR 2 hoard, or a table of mundane rope for a tier-4 party.
const TIER_LABELS: Record<string, string> = {
  "any":   "any tier",
  "0-4":   "CR 0–4 (roughly party levels 1–4)",
  "5-10":  "CR 5–10 (roughly party levels 5–10)",
  "11-16": "CR 11–16 (roughly party levels 11–16)",
  "17+":   "CR 17+ (roughly party levels 17–20)",
};

const RARITIES_BY_TIER: Record<string, string[]> = {
  // Empty = no rarity constraint. The match RPCs guard the `any` predicate on
  // cardinality, so this means "all rarities", never "no rows".
  "any":   [],
  "0-4":   ["mundane", "common", "uncommon"],
  "5-10":  ["mundane", "common", "uncommon", "rare"],
  "11-16": ["common", "uncommon", "rare", "very_rare"],
  "17+":   ["rare", "very_rare", "legendary", "artifact"],
};

// ── Text response contract ───────────────────────────────────────────────────

/**
 * One AI-generated loot entry. This function does not validate individual
 * entry fields — only that `entries` itself is a non-empty array (see the
 * parse guard in the handler). Entry validation (drop_chance range, quantity
 * sanity, required fields per type) stays CLIENT-side in
 * validateEntries/validateGeneratedLootEntry, so there is exactly one place
 * that decides what a valid loot entry looks like, exactly as
 * generate-roll-table leaves range validation to validateEntryRanges.
 *
 * `item_name` rather than an id: the model is offered names (see
 * formatItemBlock) and returns names, which the client resolves against its
 * own vault. The server never mints item rows.
 */
interface LootEntryAiResult {
  type: "item" | "currency" | "random";
  item_name?: string;
  rarity?: string;
  item_type_filter?: string | null;
  currency_label?: string | null;
  drop_chance: number;
  dice?: string | null;
  fixed_qty?: number | null;
  notes?: string | null;
  pp?: number; gp?: number; ep?: number; sp?: number; cp?: number;
}

interface LootGenerationResult {
  name: string;
  description: string;
  tags: string[];
  entries: LootEntryAiResult[];
}

// NOTE: no SCHEMA_EXTENSION_INSTRUCTION here, unlike generate-quest and
// generate-roll-table. Those two retrofitted entity references onto prompts
// that predated retrieval, so the extra fields had to be bolted on
// server-side. The 'loot' prompt (20260805000005) was written for a grounded
// generator from the start and already declares item_name as a first-class
// field, so the only thing this function appends is the candidate block
// itself.

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

  let campaign_id: string, prompt: string, cr_tier: string, exclude_attunement: boolean;

  try {
    const body = await req.json();
    campaign_id       = body.campaign_id;
    prompt            = body.prompt;
    cr_tier           = body.cr_tier;
    exclude_attunement = body.exclude_attunement === true;
    if (!campaign_id || !prompt || !cr_tier) throw new Error("invalid");
  } catch {
    return new Response("Invalid body — need { campaign_id, prompt, cr_tier }", { status: 400 });
  }

  if (!(cr_tier in RARITIES_BY_TIER)) {
    return new Response(
      `Invalid cr_tier — must be one of ${Object.keys(RARITIES_BY_TIER).join(", ")}`,
      { status: 400 },
    );
  }
  // Derived server-side from the tier, never taken from the request: the band
  // is the gate, and a client-supplied rarity list would be a gate the caller
  // controls.
  const rarities = RARITIES_BY_TIER[cr_tier];

  // AI_PROMPT_LIMIT (1000), not _SHORT (500): the panel composes the tier line
  // and any attunement note into this string alongside the DM's theme, so the
  // ceiling has to fit the whole composition (same reasoning as generate-quest).
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
    .in("generator_type", ["loot", `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === "loot");
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

  const systemContent = promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, "loot_generation");
  const cost = applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier);

  // Throttle abusive burst volume before any paid provider work (issue #466).
  //
  // This MUST stay above the retrieval block below, not just above callText.
  // Retrieval makes its own billed embedding request, and because that request
  // is recorded at delta 0 it never touches the caller's balance — so the
  // reservation is not a second line of defence for it. Gate first, embed
  // after: otherwise any authenticated campaign member can loop this endpoint
  // and run up unbounded platform spend that no throttle and no balance check
  // ever sees. See generate-encounter/generate-quest for the same reasoning.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, "loot_generation");
  if (!reservation.ok) return reservationFailureResponse(reservation);

  // ── Semantic retrieval (#602) ──────────────────────────────────────────────
  // An ENHANCEMENT, not a requirement: retrieval must never be able to take
  // loot generation down. A missing vendor, a mid-flip config, a provider
  // outage or an RPC error all cost grounding, not the feature — the whole
  // block is one try/catch whose failure path leaves the candidate list empty.
  //
  // What "ungrounded" costs here is worth being explicit about, because it is
  // steeper than it is for quests: the model falls back to naming items from
  // its training data, and the client can only resolve names that exist in the
  // DM's vault. So an ungrounded generation does not produce wrong loot, it
  // produces loot with more unresolved names for the DM to deal with — which
  // the panel surfaces rather than silently dropping.
  let candidates: CandidateItem[] = [];

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

    // Error checked rather than defaulted away: a failed fetch here is
    // indistinguishable from "this campaign has enabled no sources", and the
    // two mean opposite things — the latter is a legitimate config, the former
    // would silently drop the entire library side of the search with nothing
    // in the logs. Same block, same reasoning, as generate-encounter.
    const { data: enabledSourceRows, error: enabledSourceError } = await admin
      .from("campaign_enabled_sources")
      .select("source_slug")
      .eq("campaign_id", campaign_id);
    if (enabledSourceError) throw new Error(enabledSourceError.message);
    const enabledSlugs = (enabledSourceRows ?? []).map((r: { source_slug: string }) => r.source_slug);

    candidates = await retrieveLootItems(admin, {
      queryVector:       toVectorLiteral(vectors[0]),
      campaignId:        campaign_id,
      // The OWNER, not the caller — matching generate-encounter's bestiary and
      // generate-quest's entity scoping. A campaign member generating loot
      // sees the DM's vault, not their own.
      ownerId:           campaign.user_id,
      embeddingModel:    embedProvider.model,
      ruleset,
      rarities,
      excludeAttunement: exclude_attunement,
      // 'grimoire-bundled' is edition-neutral gear every campaign can draw
      // from regardless of enabled sources — the same constant fetchLibraryItems()
      // prepends client-side, so the generator offers exactly what the Vault shows.
      sourceKeys:        ["grimoire-bundled", ...enabledSlugs],
    });

    if (candidates.length === 0) {
      // Not necessarily an error — a brand-new campaign with no enabled
      // sources and an empty vault legitimately has nothing in band — but for
      // an established campaign it usually means the embedding backfill has
      // not been run for the item corpora yet.
      console.warn(`Loot retrieval found zero in-band items for campaign ${campaign_id} (tier ${cr_tier}) — building the prompt without the item block.`);
    }
  } catch (e) {
    // Diagnosable, but never fatal.
    const why = e instanceof EmbeddingProviderConfigError
      ? `embedding provider not usable (${e.message})`
      : e instanceof Error ? e.message : "unknown error";
    console.warn(`Loot retrieval unavailable for campaign ${campaign_id}, generating without the item block: ${why}`);
    candidates = [];
  }

  // formatItemBlock() only formats — whether to call it at all is decided
  // here, so a zero-candidate retrieval produces no prompt text at all rather
  // than an empty ---BEGIN/END--- shell.
  const itemBlock = candidates.length > 0 ? formatItemBlock(candidates) : "";

  const constraints = [`Tier: ${TIER_LABELS[cr_tier]}`];
  if (rarities.length > 0) constraints.push(`Item rarities appropriate to this tier: ${rarities.join(", ")}`);
  if (exclude_attunement) constraints.push("Avoid items that require attunement — the party has no attunement slots free.");

  const userContent =
    `${wrapUserInput(prompt)}\n\nConstraints:\n${constraints.join("\n")}` + itemBlock;

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;
  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
      // 4–8 entries of a dozen short fields each — much smaller than a
      // 100-row roll table or five quest hooks, hence 2000 rather than 3000.
      maxTokens: 2000,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response("No OpenAI API key configured", { status: 422 });
    }
    console.error("Loot text generation failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  let lootData: LootGenerationResult;
  try {
    lootData = JSON.parse(textResult.content) as LootGenerationResult;
  } catch {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed loot data — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
  // Entry-level validation stays client-side (see LootEntryAiResult's doc);
  // this guard only checks that the model returned entries at all.
  if (!Array.isArray(lootData.entries) || lootData.entries.length === 0) {
    await releaseCredits(admin, reservation.ids);
    return new Response(
      JSON.stringify({ error: "AI returned malformed loot data — please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Release the hold; record the real spend (delta 0 on BYOK).
  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, "loot_generation", textIsByok, cost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  const ai_provenance: AiProvenance = {
    generatorType: "loot_generation",
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    // `grounded` lets the panel tell the DM why a table came back with names
    // it could not resolve — an ungrounded generation is the usual reason, and
    // without this flag that looks like a resolution bug rather than a
    // backfill that has not run.
    JSON.stringify({ ...lootData, cr_tier, grounded: candidates.length > 0, ai_provenance }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
