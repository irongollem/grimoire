import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs, applyMultiplier } from "../_shared/provider-config.ts";
import {
  fetchCreditCost,
  wholeCredits,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  reservationFailureResponse,
  recordFreeGeneration,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { AI_PROMPT_LIMIT, AI_PROMPT_LIMIT_SHORT, INJECTION_GUARD_SUFFIX, validatePromptInput } from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
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
import type { CraftingDiscipline, InventionBenchEntry, InventionDraft, InventionMode } from "../_shared/invention/types.ts";

/**
 * AI invention on the experiment bench (#1103 story 5).
 *
 * The asking player pays: credits are reserved from the caller, as the paper
 * doll does, and there is NO BYOK path (campaignKeys is empty), because the
 * campaign's keys belong to the DM. The model drafts, validateInvention
 * (_shared/invention/) bounds the draft, and only a validated draft is stored.
 * Only this function writes crafting_inventions.draft; the DM approves later
 * through decide_crafting_invention.
 */

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const GENERATOR = "recipe_invention";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

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
    case "42501": return json({ error: "Only this character's own player can invent with their pack." }, 403);
    case "CX001": return json({ error: "Some of those materials are no longer in your pack." }, 409);
    case "CX002": return json({ error: "Invention is turned off in this campaign." }, 403);
    case "22023": return json({ error: "Lay out between one and eight items." }, 400);
    default: return null;
  }
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  // The user client: RLS decides what the asker may read, and craft_invention_context
  // runs under their own JWT so the seat and the bench are checked as them.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "The request body must be JSON." }, 400);
  }
  const parsed = parseInventRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
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
      return json({ error: "Could not read that invention." }, 500);
    }
    if (!data) return json({ error: "That invention was not found." }, 404);
    revising = data as InventionRow;
    // RLS also shows the DM the row; only the asker may pay to revise it.
    if (revising.user_id !== user.id) return json({ error: "Only the player who asked can revise this." }, 403);
    if (revising.status !== "draft") return json({ error: "Only a draft can be revised." }, 409);
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
    return json({ error: "Could not read the bench." }, 500);
  }
  const context = readContext(ctxRaw);
  if (!context) {
    console.error("invent-recipe: unreadable context", ctxRaw);
    return json({ error: "Could not read the bench." }, 500);
  }
  if (mode === "materials" && context.bench.length === 0) return json({ error: "Lay out between one and eight items." }, 400);

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ruleset")
    .eq("id", context.campaign_id)
    .maybeSingle();
  if (campaignError) {
    console.error("invent-recipe: campaign read failed", campaignError);
    return json({ error: "Could not read the campaign." }, 500);
  }
  if (!campaign) return json({ error: "Campaign not found." }, 404);
  if (campaign.ai_enabled !== true) return json({ error: "AI is turned off for this campaign." }, 403);

  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";
  const { data: promptRows, error: promptError } = await admin
    .from("ai_system_prompts")
    .select("generator_type, content")
    .in("generator_type", [GENERATOR, `ruleset_context_${ruleset}`]);
  if (promptError) {
    console.error("invent-recipe: prompt read failed", promptError);
    return json({ error: "Prompt not configured." }, 500);
  }
  const promptRow = promptRows?.find((r) => r.generator_type === GENERATOR);
  const rulesetContext = promptRows?.find((r) => r.generator_type === `ruleset_context_${ruleset}`)?.content ?? null;
  if (!promptRow) return json({ error: "Prompt not configured." }, 500);
  const systemContent = promptRow.content + (rulesetContext ? `\n\n${rulesetContext}` : "") + INJECTION_GUARD_SUFFIX;

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);
  // Empty campaignKeys on purpose: the campaign's keys are the DM's, and a
  // player's generation must not spend them. Platform keys and credits only.
  const text = resolveTextProvider({ chosen: campaign.text_provider, campaignKeys: {}, platformKeys, providerConfigs });
  if (!text) return new Response(NO_TEXT_PROVIDER_MESSAGE, { status: 422 });

  const cost = wholeCredits(applyMultiplier(await fetchCreditCost(admin, GENERATOR), text.textMultiplier));

  // The throttle sits above retrieval, which makes its own billed embedding request.
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return json({ error: "rate_limited" }, 429);

  const reservation = await reserveCredits(admin, user.id, cost, GENERATOR);
  if (!reservation.ok) return reservationFailureResponse(reservation);

  let held = true;
  const release = async () => {
    if (held) {
      held = false;
      await releaseCredits(admin, reservation.ids);
    }
  };

  try {
    const { ceiling } = mode === "materials" ? benchBudget(context.bench, context.value_multiple) : { ceiling: "legendary" as const };
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
        await recordFreeGeneration(admin, user.id, "entity_embedding", {
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
      bench: context.bench,
      outputCandidates,
      materialCandidates,
    };
    const userContent = buildUserContent({
      mode,
      discipline,
      valueMultiple: context.value_multiple,
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
      await release();
      console.error("invent-recipe: text generation failed", e);
      return json({ error: e instanceof Error ? e.message : "Text generation failed" }, 502);
    }

    const verdict = attempt.verdict;
    if (verdict.kind === "invalid") {
      await release();
      return json({ error: `The idea could not be fitted to the rules: ${verdict.errors[0]}` }, 422);
    }

    const spent = sumUsage(usages);
    const record = async () => {
      await release();
      await recordGeneration(admin, user.id, GENERATOR, text.isByok, cost, {
        model: spent.model,
        provider: spent.provider,
        input_tokens: spent.input_tokens,
        output_tokens: spent.output_tokens,
      });
    };

    // It ran and is charged, but there is nothing to store.
    if (verdict.kind === "nothing") {
      await record();
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
      await release();
      console.error("invent-recipe: storing the draft failed", writeError);
      return json({ error: revising && !writeError ? "That draft was sent to the DM meanwhile." : "Could not save the draft." }, revising && !writeError ? 409 : 500);
    }

    await record();
    return json({ invention: row });
  } catch (e) {
    await release();
    console.error("invent-recipe failed", e);
    return json({ error: "Invention failed. Try again." }, 500);
  }
}));
