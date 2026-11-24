import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { rulesetContextKey } from "../_shared/gameSystem.ts";
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
 * Retrieval-grounded AI quest-hook generator (#600).
 *
 * Text-only, like generate-encounter and generate-downtime: there is no
 * illustration step, so no `entity_image` charge and no image provider to
 * resolve.
 *
 * Quest generation was, until now, entirely client-side
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

// ── Text response contract ───────────────────────────────────────────────────

/**
 * One beat in a hook's story spine (#822). The "quest" system prompt row
 * (`ai_system_prompts`, rewritten in migration
 * `20260906175050_rewrite_quest_generator_prompt`) asks for this directly —
 * it is not a schema extension layered on afterward the way
 * npcs/locations/factions below are.
 */
interface QuestSpineBeatAiResult {
  /** Model-invented local id, used only to join `routes`/objective
   *  `raised_by` fields to this beat within the same hook. Never reaches the
   *  database. */
  key: string;
  title: string;
  dm_content: string;
  /** What a player is shown of this beat, while rumoured and once revealed.
   *  See `QuestSpineBeatResult.rumor_text` (src/ai/types.ts). */
  rumor_text?: string;
  reveal_text?: string;
  /** Unvalidated model output — anything other than one of the five real
   *  beat kinds is normalized to "neutral" client-side, never trusted as-is. */
  kind: string;
}

/** A directed edge between two of a hook's `beats`, referenced by `key`. */
interface QuestSpineRouteAiResult {
  from: string;
  to: string;
}

/**
 * One concrete goal the party is pursuing (epic #780: an objective is state,
 * not an event). `raised_by` names the `key` of the beat where the party
 * learns of it — the client resolves this into `pending` vs. `dormant`
 * objective rows and `quest_consequences` "raise" rows. See
 * src/lib/quests/spine.ts.
 */
interface QuestObjectiveAiResult {
  description: string;
  raised_by?: string | null;
}

/**
 * One AI-generated quest hook. This function does not validate individual
 * hook fields — only that `hooks` itself is a non-empty array (see the parse
 * guard in the handler) — so this interface documents the expected shape
 * without being enforced against it. `npcs`/`locations`/`factions` are the
 * schema extension this function adds server-side (see
 * SCHEMA_EXTENSION_INSTRUCTION below); they are OPTIONAL on purpose — a hook
 * that weaves in none of the offered entities is still a valid hook, and
 * downstream (the client's hook-to-record resolver) must tolerate a missing
 * array rather than reject the hook for lacking one. `beats`/`routes` are
 * optional for the same reason: a malformed or partial response can still
 * omit them, and the client creates the quest and its objectives regardless
 * rather than manufacturing a beat to paper over the gap (#822).
 */
interface QuestHookAiResult {
  title: string;
  summary: string;
  beats?: QuestSpineBeatAiResult[];
  routes?: QuestSpineRouteAiResult[];
  objectives: QuestObjectiveAiResult[];
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
//
// The beats/routes/objectives shape above is NOT handled this way (#822) —
// unlike this grounding instruction, it is not orthogonal to what the prompt
// already asks for, it replaces the wrong thing the prompt used to ask for
// (five prose strings under "objectives" that were actually describing story
// beats, with no real objective and no graph anywhere). That only fits in
// the DB row itself, rewritten in migration
// `20260906175050_rewrite_quest_generator_prompt`.
const SCHEMA_EXTENSION_INSTRUCTION =
  "\n\nIn addition to the fields already described, each hook object must also include " +
  '"npcs", "locations", and "factions" arrays — plain string arrays of the exact names of ' +
  "every campaign entity that hook references. Use names from the offered entities below " +
  "where applicable, plus any new minor characters, places, or groups you invent for that " +
  "hook. Omit an array (or leave it empty) if a hook references nothing of that type.";

// ── Handler ───────────────────────────────────────────────────────────────────
interface QuestCampaign extends BaseCampaign {
  game_system: string | null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  const campaign_id = typeof body?.campaign_id === "string" && body.campaign_id ? body.campaign_id : undefined;
  const prompt = typeof body?.prompt === "string" && body.prompt ? body.prompt : undefined;
  if (!campaign_id || !prompt) return jsonError(400, "invalid_body", "Need { campaign_id, prompt }.");

  // AI_PROMPT_LIMIT (1000), not _SHORT (500): the panel composes several
  // lines into this one string (party level, an optional giver/location
  // constraint block, and up to a 500-char theme), so the ceiling has to fit
  // the whole composition, not just the theme field alone.
  const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT);
  if (!promptCheck.ok) return promptCheck.errorResponse;

  // DMs only: this reads DM-only campaign content with the service role (see
  // _shared/campaignAccess.ts for why a player member must not get through).
  const load = await loadAiCampaign<QuestCampaign>(admin, campaign_id, user.id, {
    columns: ["game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Ruleset-aware generation (#564): the context row follows the campaign's 5e system; Generic has none.
  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", ["quest", ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) throw promptError;
  const promptRow = promptRows?.find((r) => r.generator_type === "quest");
  // Missing row (older DBs that predate #564) is a silent skip, not an error.
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content + SCHEMA_EXTENSION_INSTRUCTION +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) + INJECTION_GUARD_SUFFIX;

  // The platform decides the text model: the first provider the admin enabled. Refuse before anything is spent.
  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  // ── Pre-flight credit check ────────────────────────────────────────────────
  const baseCost = await fetchCreditCost(admin, "quest_generation");
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
  // balance check ever sees. See generate-encounter for the same reasoning.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  return withCreditHold(admin, { payerId: user.id, reason: "quest_generation", cost, report }, async (hold) => {
    // ── Semantic retrieval (#600) ────────────────────────────────────────────
    // An ENHANCEMENT, not a requirement: retrieval must never be able to take
    // quest generation down. A missing vendor, a mid-flip config, a provider
    // outage or an RPC error all cost grounding, not the feature — the whole
    // block is one try/catch whose failure path leaves the candidate arrays
    // empty and the prompt falls back to the plain
    // prompt: the "quest" system prompt +
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

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: text.config?.text_model,
        system: systemContent,
        user: userContent,
        // Five hooks' worth of title/summary/tags, the npcs/locations/factions
        // arrays, and (#822) a 3-5 beat spine with a dm_content paragraph per
        // beat plus routes and per-objective raised_by fields — several times
        // the payload of generate-encounter's single object, hence the larger
        // budget than its 1200. Raised from 3000 when the spine was folded
        // into the base prompt: up to 5 beats x 5 hooks of narration is the
        // single largest contributor to this budget. Raised again from 6000
        // when each beat gained its rumor and reveal copy: two short lines on
        // up to 25 beats, and a response cut off mid-object is a 502 for the
        // whole batch rather than one short hook.
        maxTokens: 8000,
      });
    } catch (e) {
      console.error("Quest text generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    const malformed = () =>
      jsonError(502, "generation_failed", "The quest hooks came back unreadable. Nothing was charged; please try again.");
    let questData: QuestGenerationResult;
    try {
      questData = JSON.parse(textResult.content) as QuestGenerationResult;
    } catch {
      return malformed();
    }
    if (!questData || !Array.isArray(questData.hooks) || questData.hooks.length === 0) return malformed();

    // Charged the moment the paid call has produced a usable result.
    hold.charge("quest_generation", {
      cost,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    // A near miss in a hook's npcs, locations or factions is put to a judgment model against exactly the
    // entities the prompt offered (per kind) and rewritten to the offered name when it is confident, so the
    // client's exact-name resolver finds the record (#1061). Free to the user; off until a typesafe key exists.
    // A polish step: if it fails the hooks go out unrepaired rather than a paid result turning into a 500.
    try {
      const named = { npcs: new Set<string>(), locations: new Set<string>(), factions: new Set<string>() };
      for (const hook of questData.hooks) {
        for (const kind of ENTITY_KINDS) for (const n of namesIn(hook?.[kind])) named[kind].add(n);
      }
      const questRepairs = await repairGeneratedNames(admin, user.id, entityRepairGroups(
        candidates,
        { npcs: [...named.npcs], locations: [...named.locations], factions: [...named.factions] },
        "Quest hooks for a D&D campaign.",
      ));
      questData = {
        ...questData,
        hooks: questData.hooks.map((hook) => {
          if (!hook || typeof hook !== "object") return hook;
          const fixed: QuestHookAiResult = { ...hook };
          ENTITY_KINDS.forEach((kind, i) => {
            const list = repairedList(questRepairs[i], hook[kind]);
            if (list !== undefined) fixed[kind] = list as string[];
          });
          return fixed;
        }),
      };
    } catch (e) {
      console.warn("Quest name repair failed; returning the hooks unrepaired:", e);
    }

    const ai_provenance: AiProvenance = {
      generatorType: "quest_generation",
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ ...questData, ai_provenance });
  });
}));
