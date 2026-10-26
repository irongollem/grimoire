import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
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
import {
  AI_PROMPT_LIMIT_SHORT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, NO_TEXT_PROVIDER_MESSAGE, resolveTextProvider, type TextResult } from "../_shared/textGen.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import { retrieveCampaignEntities, type CandidateEntity } from "../_shared/campaignEntityRetrieval.ts";
import {
  SUGGESTED_FACTION_ROLES,
  SUGGESTED_KIN_RELATIONS,
  sanitizeSuggestions,
  typeGuide,
  withTargetIds,
} from "../_shared/connectionSuggestions.ts";
import { LINK_KINDS, PERSON_KINDS, type LinkKind } from "../_shared/worldLinkCatalogue.ts";
import { campaignToday } from "../_shared/npcAge.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { gatherConnections, loadSubject, retrievalQueryFor } from "./gather.ts";

/**
 * Connection suggester (#910, widened to the whole World Web by #1084).
 *
 * Proposes ties between one thing (an NPC, a character, a faction, a place, a
 * deity or an item) and the rest of the campaign. NOTHING IS WRITTEN HERE: the
 * response is a list of proposals the DM accepts or dismisses one by one in the
 * client, which writes each through `useCreateConnection`.
 *
 * Candidates come from two places on purpose. Semantic retrieval ranks the
 * campaign's NPCs, places and factions against the subject, but it is an
 * enhancement that can be down or empty (nothing embedded yet), so a bounded
 * direct read of every kind the subject can be tied to always rides along
 * (`gather.ts`). The model may only name candidates and only types the
 * catalogue holds for the pair; `sanitizeSuggestions` drops everything else.
 *
 * Server-path only, like generate-complication: the candidate blocks come from
 * service-role reads the browser cannot make.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes, but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

/** The prompt row holds the editorial rules; the output shape below is code, so it cannot drift from the check. */
const PROMPT_ROW = "connections";
/** The ledger and price row keep their first name: renaming would split the admin's calibration history in two. */
const LEDGER_REASON = "npc_relationship_suggestion";

function outputShape(subject: LinkKind): string {
  const person = PERSON_KINDS.includes(subject);
  const shapes = [
    `{"kind":"link","target_kind":"${LINK_KINDS.join("|")}","target_name":"copied exactly from the candidates","type":"a type key from the list for that kind","subject_is_from":true or false as the list gives it,"notes":"one or two sentences: how and why, and a hook for the table"}`,
  ];
  if (person || subject === "faction") {
    shapes.push(
      `{"kind":"membership","target_kind":"${subject === "faction" ? "npc|party_member" : "faction"}","target_name":"copied exactly","role":"one of: ${SUGGESTED_FACTION_ROLES.join(", ")}","notes":"..."}`,
    );
  }
  if (person) {
    shapes.push(
      `{"kind":"kin","target_name":"copied exactly","target_type":"npc|pc","relation":"what the TARGET is to the subject; one of: ${SUGGESTED_KIN_RELATIONS.join(", ")}","parent_role":"father|mother|null","notes":"the evidence"}`,
    );
  }
  return `\n\nReturn a single JSON object {"suggestions":[...]}, each suggestion one of these shapes:\n${shapes.join("\n")}\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
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

  // Frozen or child accounts cannot generate, including BYOK (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  let campaign_id: string, subject_kind: LinkKind, subject_id: string, prompt: string;
  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    subject_id = body.subject_id;
    if (typeof campaign_id !== "string" || !campaign_id) throw new Error("invalid");
    if (typeof subject_id !== "string" || !subject_id) throw new Error("invalid");
    const kind = LINK_KINDS.find((k) => k === body.subject_kind);
    if (!kind) throw new Error("invalid");
    subject_kind = kind;
    prompt = typeof body.prompt === "string" ? body.prompt : "";
  } catch {
    return new Response("Invalid body: need { campaign_id, subject_kind, subject_id }", { status: 400 });
  }

  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, current_year, current_month, current_day, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  // DMs only, not every member: this reads backstories and DM-only ties
  // with the service role, and its notes would carry those secrets to a player.
  if (!(await isCampaignDm(admin, campaign, user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";

  const { data: promptRows } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [PROMPT_ROW, `ruleset_context_${ruleset}`]);
  const promptRow = promptRows?.find((r) => r.generator_type === PROMPT_ROW);
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === `ruleset_context_${ruleset}`)?.content ?? null;
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

  // The subject, scoped to the campaign the caller was just authorised for.
  let subject: Awaited<ReturnType<typeof loadSubject>>;
  try {
    subject = await loadSubject(admin, campaign, subject_kind, subject_id);
  } catch (e) {
    console.error("Connection suggestion could not read its subject:", e);
    return new Response("Could not read that record", { status: 502 });
  }
  if (!subject) return new Response("Not found in this campaign", { status: 404 });

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

  const systemContent = promptRow.content + outputShape(subject_kind) +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    buildCampaignContext(campaign.ai_setting_prompt) + INJECTION_GUARD_SUFFIX;

  // The platform decides the text model: a campaign on platform credits runs on
  // whichever provider the admin enabled, and `campaign.text_provider` only counts
  // when the campaign holds its own key for it. Refuse before anything is spent.
  const text = resolveTextProvider({
    chosen: campaign.text_provider,
    campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
    platformKeys,
    providerConfigs,
  });
  if (!text) {
    return new Response(
      JSON.stringify({ error: NO_TEXT_PROVIDER_MESSAGE }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  const baseCost = text.isByok ? 0 : await fetchCreditCost(admin, LEDGER_REASON);
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  // Gate before any paid provider work, retrieval's embedding included (#466).
  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const reservation = await reserveCredits(admin, user.id, cost, LEDGER_REASON);
  if (!reservation.ok) return reservationFailureResponse(reservation);

  // Everything below can throw; a thrown error must not strand the hold.
  try {
    // ── Candidates: retrieval first, then the direct reads as the floor ──────
    let retrieved: { npcs: CandidateEntity[]; factions: CandidateEntity[]; locations: CandidateEntity[] } =
      { npcs: [], factions: [], locations: [] };
    try {
      const embedProvider = await resolveEmbeddingProvider(admin, {
        openai: platformKeys.openai ?? null,
        gemini: platformKeys.gemini ?? null,
      });
      const { vectors, usage: embedUsage } = await embedProvider.embed([retrievalQueryFor(subject, prompt)]);
      // Recorded as soon as embed() returns: the spend is real even if a later
      // step throws. Platform-paid, charged to nobody.
      await recordFreeGeneration(admin, user.id, "entity_embedding", {
        model:        embedProvider.model,
        provider:     embedUsage.provider,
        input_tokens: embedUsage.input_tokens,
      });
      const found = await retrieveCampaignEntities(admin, {
        queryVector:    toVectorLiteral(vectors[0]),
        campaignId:     campaign_id,
        ownerId:        campaign.user_id,
        embeddingModel: embedProvider.model,
      });
      retrieved = { npcs: found.npcs, factions: found.factions, locations: found.locations };
    } catch (e) {
      const why = e instanceof EmbeddingProviderConfigError
        ? `embedding provider not usable (${e.message})`
        : e instanceof Error ? e.message : "unknown error";
      console.warn(`Connection retrieval unavailable for campaign ${campaign_id}, using direct candidates only: ${why}`);
    }
    const grounded = retrieved.npcs.length + retrieved.factions.length + retrieved.locations.length > 0;

    const gathered = await gatherConnections(admin, {
      campaignId: campaign_id,
      subject,
      today: campaignToday(campaign),
      retrieved,
    });

    if (gathered.candidateCount === 0) {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "There is nothing else in this campaign to connect this to yet." }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Prompt ────────────────────────────────────────────────────────────────
    const steer = prompt.trim() ? `${wrapUserInput(prompt.trim())}\n\n` : "";
    const userContent =
      `${steer}The subject to connect:\n---BEGIN SUBJECT---\n${gathered.subjectLines.join("\n")}\n---END SUBJECT---` +
      (gathered.existingLines.length > 0
        ? `\n\nTies the subject already has, read from its side (do not repeat them):\n${gathered.existingLines.join("\n")}`
        : "") +
      `\n\nTypes of link the subject can hold, by the kind of the other end (use the key; subject_is_from says which end the subject is):\n${typeGuide(subject_kind)}` +
      "\n\nCandidates. Every target_name must be copied exactly from one of these lines " +
      "(kind|name|what it is|where they are, offices held, who heads it, who carries it or who holds it; pc lines carry a name and birth year only); " +
      "the app resolves them back to real records by name.\n" +
      "---BEGIN CANDIDATES---\n" +
      gathered.candidateLines.join("\n") +
      "\n---END CANDIDATES---";

    const textModel = text.config?.text_model;

    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: textModel,
        system: systemContent,
        user: userContent,
        maxTokens: 3500,
      });
    } catch (e) {
      await releaseCredits(admin, reservation.ids);
      console.error("Connection suggestion text generation failed:", e);
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : "Text generation failed" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textResult.content);
    } catch {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "AI returned malformed suggestions, please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const sanitized = sanitizeSuggestions(parsed, gathered.context);
    const { setAside } = sanitized;
    // The client writes by id, so each suggestion carries the id of the candidate its name resolved to.
    const suggestions = withTargetIds(sanitized.suggestions, gathered.ids);
    // A set-aside claim is still worth showing: it tells the DM why nothing was offered.
    if (suggestions.length === 0 && setAside.length === 0) {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "No usable suggestions. Try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    await releaseCredits(admin, reservation.ids);
    // Nothing the DM can accept is not a generation they pay for: show why, charge nothing.
    if (suggestions.length === 0) {
      return new Response(
        JSON.stringify({ suggestions, setAside, grounded, ai_provenance: null }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    await recordGeneration(admin, user.id, LEDGER_REASON, text.isByok, cost, {
      model: textResult.usage.model, provider: textResult.usage.provider,
      input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
    });

    const ai_provenance: AiProvenance = {
      generatorType: LEDGER_REASON,
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return new Response(
      JSON.stringify({ suggestions, setAside, grounded, ai_provenance }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("Connection suggestion failed:", e);
    return new Response(
      JSON.stringify({ error: "Could not build suggestions, please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}));
