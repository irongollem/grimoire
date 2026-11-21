import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { gameSystemEdition, NO_RULES_SYSTEM_MESSAGE, rulesetContextKey } from "../_shared/gameSystem.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import { retrieveLootItems, formatItemBlock, type CandidateItem } from "../_shared/itemRetrieval.ts";
import { repairGeneratedNames } from "../_shared/nameRepairWire.ts";
import { repaired } from "../_shared/nameRepair.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { currencyPromptBlock, loadCampaignCurrency } from "../_shared/currency.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

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
  /** Currency entries: whole counts per denomination key of the campaign's currency. */
  coins?: Record<string, number>;
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

interface LootCampaign extends BaseCampaign {
  text_provider: string | null;
  game_system: string | null;
}

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate — including BYOK, which skips
  // the credit gate for both (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = typeof body?.campaign_id === "string" && body.campaign_id ? body.campaign_id : undefined;
  const prompt = typeof body?.prompt === "string" && body.prompt ? body.prompt : undefined;
  const cr_tier = typeof body?.cr_tier === "string" && body.cr_tier ? body.cr_tier : undefined;
  if (!body || !campaign_id || !prompt || !cr_tier) {
    return jsonError(400, "invalid_body", "Need { campaign_id, prompt, cr_tier }.");
  }
  const exclude_attunement = body.exclude_attunement === true;

  // Object.hasOwn, not `in`: a tier of "constructor" must not pass, and would
  // otherwise reach `.length` of a function below.
  if (!Object.hasOwn(RARITIES_BY_TIER, cr_tier)) {
    return jsonError(400, "invalid_cr_tier", `Invalid cr_tier: must be one of ${Object.keys(RARITIES_BY_TIER).join(", ")}.`);
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

  // DMs only: no player surface calls this, and it spends the campaign's
  // credits or the owner's own provider key (see _shared/campaignAccess.ts).
  const load = await loadAiCampaign<LootCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system.
  // 5e-shaped output with no meaning in a Generic campaign (#934): the client
  // hides the button, this is the server-side backstop. No edition, no fallback.
  const ruleset = gameSystemEdition(campaign.game_system);
  if (!ruleset) return jsonError(400, "no_rules_system", NO_RULES_SYSTEM_MESSAGE);
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["loot", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "loot");
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
  const systemContent = promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) + INJECTION_GUARD_SUFFIX;

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
  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, "loot_generation");
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  // Throttle abusive burst volume before any paid provider work (issue #466).
  //
  // This MUST stay above the retrieval block below, not just above callText.
  // Retrieval makes its own billed embedding request, and because that request
  // is recorded at delta 0 it never touches the caller's balance — so the
  // reservation is not a second line of defence for it. Gate first, embed
  // after: otherwise any authenticated campaign member can loop this endpoint
  // and run up unbounded platform spend that no throttle and no balance check
  // ever sees. See generate-encounter/generate-quest for the same reasoning.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  // Everything that can be worked out before paying is: the prompt's fixed parts and the campaign's currency read.
  const constraints = [`Tier: ${TIER_LABELS[cr_tier]}`];
  if (rarities.length > 0) constraints.push(`Item rarities appropriate to this tier: ${rarities.join(", ")}`);
  if (exclude_attunement) constraints.push("Avoid items that require attunement — the party has no attunement slots free.");

  // The coin map the model answers in is keyed by the campaign's denominations.
  let currencyBlock: string;
  try {
    currencyBlock = currencyPromptBlock(await loadCampaignCurrency(admin, campaign_id));
  } catch (e) {
    console.error("Loot currency read failed:", e);
    return jsonError(500, "currency_read_failed", "Could not read the campaign's currency.");
  }

  return withCreditHold(admin, { payerId: user.id, reason: "loot_generation", cost, report }, async (hold) => {
    // ── Semantic retrieval (#602) ────────────────────────────────────────────
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

      // Queued HERE, not after the RPCs below — real provider spend was
      // incurred the moment embed() returned, and everything after this point
      // can throw into the catch. A free line is written whatever the work
      // does, so a transient DB error cannot turn real money into invisible
      // spend. Platform-paid, charged to nobody.
      hold.free("entity_embedding", {
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

    const userContent =
      `${wrapUserInput(prompt)}\n\nConstraints:\n${constraints.join("\n")}` + currencyBlock + itemBlock;

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
        // 4–8 entries of a dozen short fields each — much smaller than a
        // 100-row roll table or five quest hooks, hence 2000 rather than 3000.
        maxTokens: 2000,
      });
    } catch (e) {
      console.error("Loot text generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    const malformed = () =>
      jsonError(502, "generation_failed", "The loot table came back unreadable. Nothing was charged; please try again.");
    let lootData: LootGenerationResult;
    try {
      lootData = JSON.parse(textResult.content) as LootGenerationResult;
    } catch {
      return malformed();
    }
    // Entry-level validation stays client-side (see LootEntryAiResult's doc);
    // this guard only checks that the model returned entries at all. A reply of
    // `null` parses fine, so it is checked here rather than read through.
    if (!lootData || !Array.isArray(lootData.entries) || lootData.entries.length === 0) return malformed();

    // Charged the moment the paid call has produced a usable result (delta 0 on BYOK).
    hold.charge("loot_generation", {
      cost,
      isByok: text.isByok,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    // A near miss ("Potion of Healing (greater)") is put to a judgment model against exactly the items the
    // prompt offered and rewritten to the offered name when it is confident, so the client's exact-name
    // resolver finds the row (#1061). Free to the user; off until a typesafe key exists.
    // A polish step: if it fails the table goes out unrepaired rather than a paid result turning into a 500.
    try {
      const [itemRepairs] = await repairGeneratedNames(admin, user.id, [{
        names: lootData.entries
          .filter((e) => e?.type === "item" && typeof e.item_name === "string")
          .map((e) => ({ name: e.item_name as string, note: typeof e.notes === "string" ? e.notes : undefined })),
        offered: candidates.map((c) => ({ name: c.name, hint: `${c.rarity} ${c.itemType}` })),
        context: "Treasure for a D&D loot table. Each entry names one item.",
      }]);
      lootData = {
        ...lootData,
        entries: lootData.entries.map((e) =>
          e?.type === "item" && typeof e.item_name === "string" ? { ...e, item_name: repaired(itemRepairs, e.item_name) } : e),
      };
    } catch (e) {
      console.warn("Loot name repair failed; returning the table unrepaired:", e);
    }

    const ai_provenance: AiProvenance = {
      generatorType: "loot_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    // `grounded` lets the panel tell the DM why a table came back with names
    // it could not resolve — an ungrounded generation is the usual reason, and
    // without this flag that looks like a resolution bug rather than a
    // backfill that has not run.
    return json({ ...lootData, cr_tier, grounded: candidates.length > 0, ai_provenance });
  });
}));
