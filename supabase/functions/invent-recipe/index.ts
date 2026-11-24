import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { loadCampaignCurrency, type CurrencyConfig } from "../_shared/currency.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import { gameSystemEdition, NO_RULES_SYSTEM_MESSAGE, rulesetContextKey } from "../_shared/gameSystem.ts";
import { fetchCreditCost, wholeCredits } from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { AI_PROMPT_LIMIT, AI_PROMPT_LIMIT_SHORT, INJECTION_GUARD_SUFFIX, validatePromptInput } from "../_shared/ai-prompt.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import { resolveEmbeddingProvider, toVectorLiteral } from "../_shared/embeddings.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { benchBudget, buildUserContent, gatherCandidates } from "../_shared/invention/candidates.ts";
import {
  benchRowIds,
  parseInventRequest,
  parseModelAnswer,
  readContext,
  repairSuffix,
  sumUsage,
  type InventRequest,
  type Usage,
} from "../_shared/invention/request.ts";
import { validateInvention, type InventionContext, type InventionVerdict } from "../_shared/invention/validate.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import type { CraftingDiscipline, InventionBenchEntry, InventionDraft, InventionMode } from "../_shared/invention/types.ts";


/**
 * AI invention on the experiment bench (#1103 story 5).
 *
 * The asking player pays: credits are reserved from the caller, as the paper
 * doll does, and the platform's keys run it, never the DM's. The model drafts, validateInvention
 * (_shared/invention/) bounds the draft, and only a validated draft is stored.
 * Only this function writes crafting_inventions.draft; the DM approves later
 * through decide_crafting_invention.
 */

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const GENERATOR = "recipe_invention";

/** The row, as the revise path needs it. */
interface InventionRow {
  id: string;
  user_id: string;
  party_member_id: string;
  discipline: CraftingDiscipline;
  mode: InventionMode;
  wish: string | null;
  bench: InventionBenchEntry[];
  draft: InventionDraft;
  revision: number;
  status: string;
  dm_note: string | null;
}

function contextRefusal(code: string | undefined): Response | null {
  switch (code) {
    case "42501": return jsonError(403, "forbidden", "Only this character's own player can invent with their pack.");
    case "CX001": return jsonError(409, "materials_missing", "Some of those materials are no longer in your pack.");
    case "CX002": return jsonError(403, "invention_disabled", "Invention is turned off in this campaign.");
    case "22023": return jsonError(400, "invalid_bench", "Lay out between one and eight items.");
    default: return null;
  }
}

interface InventionCampaign extends BaseCampaign {
  game_system: string | null;
}

serve(serveUser(async ({ user, req, userClient: supabase, report }) => {
  // The user client (`supabase`): RLS decides what the asker may read, and craft_invention_context
  // runs under their own JWT so the seat and the bench are checked as them.
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", "The request body must be a JSON object.");
  const parsed = parseInventRequest(body);
  if (!parsed.ok) return jsonError(400, "invalid_body", parsed.error);
  const request: InventRequest = parsed.request;

  const freeText = request.action === "idea" ? request.wish : request.action === "revise" ? request.note : null;
  if (freeText !== null) {
    const check = validatePromptInput(freeText, request.action === "idea" ? AI_PROMPT_LIMIT : AI_PROMPT_LIMIT_SHORT);
    if (!check.ok) return check.errorResponse;
  }

  // What the draft is made from: the request itself, or the draft being revised.
  let revising: InventionRow | null = null;
  let partyMemberId: string;
  let discipline: CraftingDiscipline;
  let mode: InventionMode;
  let wish: string | null;
  let rowIds: string[];
  if (request.action === "revise") {
    const { data, error } = await supabase.from("crafting_inventions").select("*").eq("id", request.invention_id).maybeSingle();
    if (error) {
      console.error("invent-recipe: invention read failed", error);
      return jsonError(500, "invention_read_failed", "Could not read that invention.");
    }
    if (!data) return jsonError(404, "invention_not_found", "That invention was not found.");
    revising = data as InventionRow;
    // RLS also shows the DM the row; only the asker may pay to revise it.
    if (revising.user_id !== user.id) return jsonError(403, "forbidden", "Only the player who asked can revise this.");
    if (revising.status !== "draft") return jsonError(409, "not_a_draft", "Only a draft can be revised.");
    partyMemberId = revising.party_member_id;
    discipline = revising.discipline;
    mode = revising.mode;
    wish = revising.wish;
    rowIds = mode === "materials" ? benchRowIds(revising.bench) : [];
  } else {
    partyMemberId = request.party_member_id;
    discipline = request.discipline;
    mode = request.action;
    wish = request.action === "idea" ? request.wish : null;
    rowIds = request.row_ids;
  }

  const { data: ctxRaw, error: ctxError } = await supabase.rpc("craft_invention_context", {
    p_party_member_id: partyMemberId,
    p_discipline: discipline,
    p_row_ids: rowIds,
  });
  if (ctxError) {
    const refusal = contextRefusal(ctxError.code);
    if (refusal) return refusal;
    console.error("invent-recipe: context failed", ctxError);
    return jsonError(500, "bench_read_failed", "Could not read the bench.");
  }
  const context = readContext(ctxRaw);
  if (!context) {
    console.error("invent-recipe: unreadable context", ctxRaw);
    return jsonError(500, "bench_read_failed", "Could not read the bench.");
  }
  if (mode === "materials" && context.bench.length === 0) return jsonError(400, "invalid_bench", "Lay out between one and eight items.");

  // Who may ask was settled above, by `craft_invention_context` running as the player (their seat, their pack), so
  // the access rule here is "anyone who got that far": the campaign is named by the context, not by the body, and
  // is not the DM's to gate. The campaign read (its error checked) and the AI switch are the shared ones.
  const load = await loadAiCampaign<InventionCampaign>(admin, context.campaign_id, user.id, {
    columns: ["game_system"],
    access: async () => true,
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  // Recipes draw on the 5e item library: a Generic campaign has none (#934).
  const ruleset = gameSystemEdition(campaign.game_system);
  if (!ruleset) return jsonError(400, "no_rules_system", NO_RULES_SYSTEM_MESSAGE);
  const rulesetKey = rulesetContextKey(campaign.game_system);
  // Read once: the validator prices in these coins and the model is told them.
  let currency: CurrencyConfig;
  try {
    currency = await loadCampaignCurrency(admin, context.campaign_id);
  } catch (e) {
    console.error("invent-recipe: currency read failed", e);
    return jsonError(500, "campaign_read_failed", "Could not read the campaign.");
  }
  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts")
    .select("generator_type, content")
    .in("generator_type", [GENERATOR, ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptError) {
    console.error("invent-recipe: prompt read failed", promptError);
    return jsonError(500, "prompt_not_configured", "Prompt not configured.");
  }
  const promptRow = promptRows?.find((r) => r.generator_type === GENERATOR);
  const rulesetContext = promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "Prompt not configured.");
  const systemContent = promptRow.content + (rulesetContext ? `\n\n${rulesetContext}` : "") + INJECTION_GUARD_SUFFIX;

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);
  // Platform keys and the asking player's credits only.
  const text = resolveTextProvider({ platformKeys, providerConfigs });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  const cost = wholeCredits(applyMultiplier(await fetchCreditCost(admin, GENERATOR), text.textMultiplier));

  // The throttle sits above retrieval, which makes its own billed embedding request.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  return withCreditHold(admin, { payerId: user.id, reason: GENERATOR, cost, report }, async (hold) => {
    try {
      const { ceiling } = mode === "materials" ? benchBudget(context.bench, context.value_multiple, currency) : { ceiling: "legendary" as const };
      // The table guarantees an idea has a wish; a null here is a corrupt row, not a case to paper over.
      if (mode === "idea" && wish === null) throw new Error("An idea invention has no wish.");
      const base = mode === "materials" ? context.bench.map((b) => b.name).join(", ") : (wish as string);
      const queryText = request.action === "revise" ? `${base}\n${request.note}` : base;

      const { outputCandidates, materialCandidates } = await gatherCandidates(admin, {
        campaignId: context.campaign_id,
        // The owner, not the caller: a player draws on the DM's vault.
        ownerId: campaign.user_id,
        ruleset,
        discipline,
        ceiling,
        queryText,
        wantMaterials: mode === "idea",
        embed: async (t) => {
          const provider = await resolveEmbeddingProvider(admin, {
            openai: platformKeys.openai ?? null,
            gemini: platformKeys.gemini ?? null,
          });
          const { vectors, usage } = await provider.embed([t]);
          // Recorded as soon as the provider has been paid, before anything that can throw.
          hold.free("entity_embedding", {
            model: provider.model,
            provider: usage.provider,
            input_tokens: usage.input_tokens,
          });
          return { vector: toVectorLiteral(vectors[0]), model: provider.model };
        },
      });

      const validationContext: InventionContext = {
        mode,
        discipline,
        valueMultiple: context.value_multiple,
        currency,
        bench: context.bench,
        outputCandidates,
        materialCandidates,
      };
      const userContent = buildUserContent({
        mode,
        discipline,
        valueMultiple: context.value_multiple,
        currency,
        bench: context.bench,
        outputCandidates,
        materialCandidates,
        wish,
        revision: revising && request.action === "revise" ? { previous: revising.draft, note: request.note, dmNote: revising.dm_note } : null,
      });

      const usages: Usage[] = [];
      const ask = async (user_: string): Promise<{ content: string; verdict: InventionVerdict }> => {
        const result: TextResult = await callText({ text, model: text.config?.text_model, system: systemContent, user: user_, maxTokens: 3000 });
        usages.push(result.usage);
        const answer = parseModelAnswer(result.content);
        const verdict: InventionVerdict = answer.ok
          ? validateInvention(answer.value, validationContext)
          : { kind: "invalid", errors: ["The answer was not valid JSON."] };
        return { content: result.content, verdict };
      };

      let attempt: { content: string; verdict: InventionVerdict };
      try {
        attempt = await ask(userContent);
        if (attempt.verdict.kind === "invalid") {
          attempt = await ask(userContent + repairSuffix(attempt.content, attempt.verdict.errors));
        }
      } catch (e) {
        console.error("invent-recipe: text generation failed", e);
        return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
      }

      const verdict = attempt.verdict;
      // One line for the whole exchange: the repair retry is part of the same invention, so its usage is summed.
      const spent = sumUsage(usages);
      const log = {
        model: spent.model,
        provider: spent.provider,
        input_tokens: spent.input_tokens,
        output_tokens: spent.output_tokens,
      };
      const charge = () => hold.charge(GENERATOR, { cost, log });
      // The player is not charged on the paths that give them nothing, but the platform paid the provider, so that
      // spend is still recorded (#1234: spend that vanished from the cost reports).
      const recordUncharged = () => hold.free(GENERATOR, log);

      // Not fitted to the rules: nothing to store and nothing charged.
      if (verdict.kind === "invalid") {
        recordUncharged();
        return jsonError(422, "invention_invalid", `The idea could not be fitted to the rules: ${verdict.errors[0]}`);
      }

      // It ran and is charged, but there is nothing to store.
      if (verdict.kind === "nothing") {
        charge();
        return json({ result: "nothing", reason: verdict.reason });
      }

      const ai_provenance: AiProvenance = {
        generatorType: GENERATOR,
        provider: spent.provider,
        model: spent.model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };

      // A revision has answered the DM's send-back note (it went to the model above), so the note
      // goes with it: left on, every later revision would apply it again and the DM's queue would
      // show it beside a draft that already addressed it.
      const write = revising
        ? admin
          .from("crafting_inventions")
          .update({ draft: verdict.draft, ai_provenance, revision: revising.revision + 1, dm_note: null })
          .eq("id", revising.id)
          .eq("status", "draft")
          .select("*")
          .maybeSingle()
        : admin
          .from("crafting_inventions")
          .insert({
            campaign_id: context.campaign_id,
            party_member_id: partyMemberId,
            user_id: user.id,
            discipline,
            mode,
            wish,
            bench: context.bench,
            draft: verdict.draft,
            ai_provenance,
            status: "draft",
          })
          .select("*")
          .maybeSingle();
      const { data: row, error: writeError } = await write;
      if (writeError || !row) {
        // The player gets nothing for the model call, so they are not charged for it.
        recordUncharged();
        console.error("invent-recipe: storing the draft failed", writeError);
        return revising && !writeError
          ? jsonError(409, "draft_already_sent", "That draft was sent to the DM meanwhile.")
          : jsonError(500, "save_failed", "Could not save the draft.");
      }

      // Charged only now: a stored draft is the thing the player pays for.
      charge();
      return json({ invention: row });
    } catch (e) {
      console.error("invent-recipe failed", e);
      return jsonError(500, "invention_failed", "Invention failed. Try again.");
    }
  });
}));
