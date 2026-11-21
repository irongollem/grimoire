import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { loadCampaignKeys } from "../_shared/campaignKeys.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT_SHORT,
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
import {
  retrieveCampaignEntities,
  formatEntityBlock,
  type CandidateEntity,
} from "../_shared/campaignEntityRetrieval.ts";
import { repairGeneratedNames } from "../_shared/nameRepairWire.ts";
import { ENTITY_KINDS, entityRepairGroups, namesIn, repairedList } from "../_shared/nameRepair.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

/**
 * Retrieval-grounded AI roll-table generator (#600).
 *
 * Text-only, like generate-quest and generate-encounter: there is no
 * illustration step, so no `entity_image` charge and no image provider to
 * resolve.
 *
 * Roll tables were, until now, entirely client-side BYOK-only
 * (src/ai/useRollTableGeneration.ts): the same "roll_table" system prompt +
 * ruleset context + campaign setting as here, but with zero visibility into
 * the DM's own NPCs, factions and locations. This function is the server
 * path, reusing the exact embed → RPC-retrieve → candidate-block machinery
 * generate-quest established (and this repo's second consumer of the
 * extracted _shared/campaignEntityRetrieval.ts module), so a table entry can
 * reference a real campaign entity instead of always inventing one.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Local copy of src/types/rollTable.types.ts's ROLL_TABLE_DICE/ROLL_TABLE_DIE_MAX
// — edge functions don't import from src/, so the seven supported dice and
// each one's max face are duplicated here. Keep in sync if the client ever
// adds an eighth die.
const DIE_MAX: Record<string, number> = {
  "1d4":   4,
  "1d6":   6,
  "1d8":   8,
  "1d10":  10,
  "1d12":  12,
  "1d20":  20,
  "1d100": 100,
};

// ── Text response contract ───────────────────────────────────────────────────

/** One AI-generated roll-table entry — ranges are inclusive, no client `id` yet. */
interface RollTableEntryAiResult {
  min: number;
  max: number;
  label: string;
  notes?: string | null;
}

/**
 * This function does not validate individual entry fields or range coverage
 * — only that `entries` itself is a non-empty array (see the parse guard in
 * the handler). Range/coverage validation (gaps, overlaps, out-of-bounds)
 * deliberately stays CLIENT-side — validateEntryRanges in
 * src/types/rollTable.types.ts runs there for both this server path and the
 * local BYOK path, so there is exactly one place that decides what a valid
 * table looks like. `npcs`/`locations`/`factions` are the schema extension
 * this function adds server-side (see SCHEMA_EXTENSION_INSTRUCTION below);
 * they are OPTIONAL on purpose — a table that weaves in none of the offered
 * entities is still a valid table, and downstream (the client's
 * entity-to-record resolver) must tolerate a missing array rather than
 * reject the table for lacking one.
 */
interface RollTableGenerationResult {
  name: string;
  description: string;
  tags: string[];
  entries: RollTableEntryAiResult[];
  npcs?: string[];
  locations?: string[];
  factions?: string[];
}

// Appended to the system prompt server-side — the DB "roll_table" prompt row
// itself is not modified. Tells the model to extend its existing JSON schema
// with the three entity-reference arrays that make the candidate block
// (built in the handler below) actually useful downstream: without an
// explicit callout, a general-purpose "here are some names you can use"
// block tends to get treated as flavor rather than as fields the model is
// expected to echo back in a structured way the client can resolve by name.
const SCHEMA_EXTENSION_INSTRUCTION =
  "\n\nIn addition to the fields already described, the table object must also include " +
  '"npcs", "locations", and "factions" arrays — plain string arrays of the exact names of ' +
  "every campaign entity referenced across the table's entries (their labels or notes). Use " +
  "names from the offered entities below where applicable, plus any new minor characters, " +
  "places, or groups you invent for an entry. Omit an array (or leave it empty) if no entry " +
  "references anything of that type.";

interface RollTableCampaign extends BaseCampaign {
  text_provider: string | null;
  game_system: string | null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate — including BYOK, which skips
  // the credit gate for both (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = typeof body?.campaign_id === "string" && body.campaign_id ? body.campaign_id : undefined;
  const prompt = typeof body?.prompt === "string" && body.prompt ? body.prompt : undefined;
  const die = typeof body?.die === "string" && body.die ? body.die : undefined;
  if (!campaign_id || !prompt || !die) return jsonError(400, "invalid_body", "Need { campaign_id, prompt, die }.");

  // Object.hasOwn, not `in`: a die of "constructor" must not pass.
  if (!Object.hasOwn(DIE_MAX, die)) {
    return jsonError(400, "invalid_die", `Invalid die: must be one of ${Object.keys(DIE_MAX).join(", ")}.`);
  }
  const dieMax = DIE_MAX[die];

  // The client sends the raw concept textarea (capped at AI_PROMPT_LIMIT_SHORT
  // client-side already) — nothing else is composed into it, unlike
  // generate-quest's prompt, which is why this checks against _SHORT (500)
  // rather than the full AI_PROMPT_LIMIT (1000).
  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: this reads DM-only campaign content with the service role (see
  // _shared/campaignAccess.ts for why a player member must not get through).
  const load = await loadAiCampaign<RollTableCampaign>(admin, campaign_id, user.id, {
    columns: ["text_provider", "game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system; Generic has none.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["roll_table", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "roll_table");
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
  const systemContent = promptRow.content + SCHEMA_EXTENSION_INSTRUCTION +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) + INJECTION_GUARD_SUFFIX;

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

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, "roll_table_generation");
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  // Throttle abusive burst volume before any paid provider work (issue #466).
  //
  // This MUST stay above the retrieval block below, not just above callText.
  // Retrieval makes its own billed embedding request, and because that
  // request is recorded at delta 0 it never touches the caller's balance —
  // so the reservation is not a second line of defence for it. Gate first,
  // embed after: otherwise any authenticated campaign member can loop this
  // endpoint and run up unbounded platform spend that no throttle and no
  // balance check ever sees. See generate-encounter/generate-quest for the
  // same reasoning.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  return withCreditHold(admin, { payerId: user.id, reason: "roll_table_generation", cost, report }, async (hold) => {
    // ── Semantic retrieval (#600) ────────────────────────────────────────────
    // An ENHANCEMENT, not a requirement: retrieval must never be able to take
    // roll-table generation down. A missing vendor, a mid-flip config, a
    // provider outage or an RPC error all cost grounding, not the feature —
    // the whole block is one try/catch whose failure path leaves the
    // candidates empty and the prompt falls back to exactly what the
    // client-side BYOK path already sends (see useRollTableGeneration.ts): the
    // "roll_table" system prompt + ruleset context + campaign setting, no
    // entity block.
    let candidates: { npcs: CandidateEntity[]; locations: CandidateEntity[]; factions: CandidateEntity[] } =
      { npcs: [], locations: [], factions: [] };
    let retrievalOk = false;

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

      candidates = await retrieveCampaignEntities(admin, {
        queryVector:    toVectorLiteral(vectors[0]),
        campaignId:     campaign_id,
        // The OWNER, not the caller — matching generate-encounter's bestiary
        // and generate-quest's entity scoping. A campaign member generating a
        // roll table sees the DM's NPCs, factions and locations, not their own
        // (players don't have any).
        ownerId:        campaign.user_id,
        embeddingModel: embedProvider.model,
      });

      const totalCandidates = candidates.npcs.length + candidates.locations.length + candidates.factions.length;
      if (totalCandidates === 0) {
        // Not necessarily an error — a brand-new campaign legitimately has no
        // NPCs/locations/factions yet — but it means there is nothing to
        // ground the table in, so it is worth a look if it happens for a
        // long-running campaign that plainly has entities.
        console.warn(`Roll table retrieval found zero campaign entities for campaign ${campaign_id} — building the prompt without the entity block.`);
      } else {
        retrievalOk = true;
      }
    } catch (e) {
      // Diagnosable, but never fatal.
      const why = e instanceof EmbeddingProviderConfigError
        ? `embedding provider not usable (${e.message})`
        : e instanceof Error ? e.message : "unknown error";
      console.warn(`Roll table retrieval unavailable for campaign ${campaign_id}, falling back to the client-equivalent prompt: ${why}`);
      candidates = { npcs: [], locations: [], factions: [] };
    }

    // formatEntityBlock() only formats — whether to call it at all is decided
    // here, so a zero-candidate retrieval produces no prompt text at all
    // rather than an empty ---BEGIN/END--- shell.
    const entityBlock = retrievalOk ? formatEntityBlock(candidates, "writing table entries") : "";

    // Constraint text is the client's exact current wording (useRollTableGeneration.ts)
    // — kept identical so a table generated server-side reads the same as one
    // generated via the local BYOK path.
    const userContent =
      `${wrapUserInput(prompt)}\n\nConstraints:\n` +
      `Die: ${die}\n` +
      `Entries must cover the full range 1–${dieMax} with no gaps and no overlaps.` +
      entityBlock;

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
        // A 1d100 table can run up to 100 entries, each with a label and
        // optional notes, plus the npcs/locations/factions arrays this
        // function adds to the schema — several times the payload of
        // generate-encounter's single object, hence the larger budget than
        // its 1200 (matches generate-quest's 3000).
        maxTokens: 3000,
      });
    } catch (e) {
      console.error("Roll table text generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    const malformed = () =>
      jsonError(502, "generation_failed", "The roll table came back unreadable. Nothing was charged; please try again.");
    let rollTableData: RollTableGenerationResult;
    try {
      rollTableData = JSON.parse(textResult.content) as RollTableGenerationResult;
    } catch {
      return malformed();
    }
    // Range/coverage validation (gaps, overlaps, out-of-bounds) deliberately
    // stays CLIENT-side — validateEntryRanges runs there for both this server
    // path and the local BYOK path. This guard only checks that the model
    // returned a non-empty entries array at all.
    if (!rollTableData || !Array.isArray(rollTableData.entries) || rollTableData.entries.length === 0) return malformed();

    // Charged the moment the paid call has produced a usable result (delta 0 on BYOK).
    hold.charge("roll_table_generation", {
      cost,
      isByok: text.isByok,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    // A near miss in the table's npcs, locations or factions is put to a judgment model against exactly the
    // entities the prompt offered (per kind) and rewritten to the offered name when it is confident, so the
    // client's exact-name resolver finds the record (#1061). Free to the user; off until a typesafe key exists.
    // A polish step: if it fails the table goes out unrepaired rather than a paid result turning into a 500.
    try {
      const tableRepairs = await repairGeneratedNames(admin, user.id, entityRepairGroups(
        candidates,
        { npcs: namesIn(rollTableData.npcs), locations: namesIn(rollTableData.locations), factions: namesIn(rollTableData.factions) },
        "A random table for a D&D campaign.",
      ));
      const fixedTable: RollTableGenerationResult = { ...rollTableData };
      ENTITY_KINDS.forEach((kind, i) => {
        const list = repairedList(tableRepairs[i], rollTableData[kind]);
        if (list !== undefined) fixedTable[kind] = list as string[];
      });
      rollTableData = fixedTable;
    } catch (e) {
      console.warn("Roll table name repair failed; returning the table unrepaired:", e);
    }

    const ai_provenance: AiProvenance = {
      generatorType: "roll_table_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...rollTableData, ai_provenance });
  });
}));
