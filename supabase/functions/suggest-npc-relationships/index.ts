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
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";
import {
  resolveEmbeddingProvider,
  toVectorLiteral,
  EmbeddingProviderConfigError,
} from "../_shared/embeddings.ts";
import {
  retrieveCampaignEntities,
  type CandidateEntity,
} from "../_shared/campaignEntityRetrieval.ts";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { truncateAtWordBoundary } from "../_shared/embedTextUtil.ts";
import { sanitizeSuggestions } from "../_shared/npcRelationshipSuggestions.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";

/**
 * NPC relationship suggester (#910).
 *
 * Proposes ties between one NPC and the rest of the campaign (other NPCs and
 * factions). NOTHING IS WRITTEN HERE: the response is a list of proposals the
 * DM accepts or dismisses one by one in the client.
 *
 * Candidates come from two places on purpose. Semantic retrieval ranks the
 * campaign's entities against the NPC, but it is an enhancement that can be
 * down or empty (nothing embedded yet), so a bounded direct read of the
 * campaign's other NPCs and factions always rides along. The model may only
 * name candidates, and `sanitizeSuggestions` drops everything else.
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

const PROMPT_ROW = "npc_relationships";
const LEDGER_REASON = "npc_relationship_suggestion";

const MAX_DIRECT_NPCS = 40;
const MAX_DIRECT_FACTIONS = 30;
const FIELD_CHAR_LIMIT = 1500;

function plain(value: string | null | undefined): string {
  if (!value) return "";
  return truncateAtWordBoundary(toPlainText(value).replace(/\s+/g, " ").trim(), FIELD_CHAR_LIMIT);
}

interface SourceNpc {
  id: string;
  name: string;
  occupation: string | null;
  race: string | null;
  personality: string | null;
  backstory: string | null;
  appearance: string | null;
}

interface NamedRow { id: string; name: string; occupation?: string | null; faction_type?: string | null }

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

  let campaign_id: string, npc_id: string, prompt: string;
  try {
    const body = await req.json();
    campaign_id = body.campaign_id;
    npc_id = body.npc_id;
    if (typeof campaign_id !== "string" || !campaign_id) throw new Error("invalid");
    if (typeof npc_id !== "string" || !npc_id) throw new Error("invalid");
    prompt = typeof body.prompt === "string" ? body.prompt : "";
  } catch {
    return new Response("Invalid body: need { campaign_id, npc_id }", { status: 400 });
  }

  if (prompt) {
    const promptCheck = validatePromptInput(prompt, AI_PROMPT_LIMIT_SHORT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", campaign_id)
    .maybeSingle();
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  // DMs only, not every member: this reads NPC backstories and DM-only ties
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

  // The source NPC, scoped to the campaign the caller was just authorised for.
  const { data: sourceRow } = await admin
    .from("npcs")
    .select("id, name, occupation, race, personality, backstory, appearance")
    .eq("id", npc_id)
    .eq("campaign_id", campaign_id)
    .maybeSingle();
  if (!sourceRow) return new Response("NPC not found", { status: 404 });
  const source = sourceRow as SourceNpc;

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

  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, LEDGER_REASON);
  const cost = wholeCredits(
    applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier),
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
    // ── What the NPC already has ─────────────────────────────────────────────
    const [relsRes, memberRes, npcsRes, factionsRes] = await Promise.all([
      admin.from("npc_relationships")
        .select("npc_id, related_npc_id, relationship_type")
        .eq("campaign_id", campaign_id)
        .or(`npc_id.eq.${npc_id},related_npc_id.eq.${npc_id}`),
      admin.from("faction_npcs")
        .select("faction_id")
        .eq("npc_id", npc_id),
      admin.from("npcs")
        .select("id, name, occupation")
        .eq("campaign_id", campaign_id)
        .neq("id", npc_id)
        .order("updated_at", { ascending: false })
        .limit(MAX_DIRECT_NPCS * 2),
      admin.from("factions")
        .select("id, name, faction_type")
        .eq("campaign_id", campaign_id)
        .order("updated_at", { ascending: false })
        .limit(MAX_DIRECT_FACTIONS * 2),
    ]);
    if (relsRes.error) throw new Error(relsRes.error.message);
    if (memberRes.error) throw new Error(memberRes.error.message);
    if (npcsRes.error) throw new Error(npcsRes.error.message);
    if (factionsRes.error) throw new Error(factionsRes.error.message);

    const campaignNpcs = (npcsRes.data ?? []) as NamedRow[];
    const campaignFactions = (factionsRes.data ?? []) as NamedRow[];
    const npcNameById = new Map(campaignNpcs.map((n) => [n.id, n.name]));
    const factionNameById = new Map(campaignFactions.map((f) => [f.id, f.name]));

    const existingTies = (relsRes.data ?? []).map((r) => {
      const otherId = r.npc_id === npc_id ? r.related_npc_id : r.npc_id;
      return { otherId, name: npcNameById.get(otherId) ?? null, type: r.relationship_type as string };
    });
    const relatedIds = new Set(existingTies.map((t) => t.otherId));
    const existingNpcNames = existingTies.flatMap((t) => (t.name ? [t.name] : []));

    const memberFactionIds = new Set((memberRes.data ?? []).map((m) => m.faction_id as string));
    const existingFactionNames = [...memberFactionIds].flatMap((id) => {
      const n = factionNameById.get(id);
      return n ? [n] : [];
    });

    // ── Candidates: retrieval first, then a direct read as the floor ─────────
    const retrievalQuery = [
      source.name,
      source.occupation,
      plain(source.personality).slice(0, 300),
      plain(source.backstory).slice(0, 300),
      prompt.trim(),
    ].filter(Boolean).join(". ");

    let retrievedNpcs: CandidateEntity[] = [];
    let retrievedFactions: CandidateEntity[] = [];
    try {
      const embedProvider = await resolveEmbeddingProvider(admin, {
        openai: platformKeys.openai ?? null,
        gemini: platformKeys.gemini ?? null,
      });
      const { vectors, usage: embedUsage } = await embedProvider.embed([retrievalQuery]);
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
      retrievedNpcs = found.npcs;
      retrievedFactions = found.factions;
    } catch (e) {
      const why = e instanceof EmbeddingProviderConfigError
        ? `embedding provider not usable (${e.message})`
        : e instanceof Error ? e.message : "unknown error";
      console.warn(`NPC relationship retrieval unavailable for campaign ${campaign_id}, using direct candidates only: ${why}`);
    }

    const sourceKey = source.name.trim().toLowerCase();
    const existingNpcKeys = new Set(existingNpcNames.map((n) => n.toLowerCase()));
    const existingFactionKeys = new Set(existingFactionNames.map((n) => n.toLowerCase()));

    function merge(
      retrieved: CandidateEntity[],
      direct: CandidateEntity[],
      excluded: Set<string>,
      cap: number,
    ): CandidateEntity[] {
      const seen = new Set<string>();
      const out: CandidateEntity[] = [];
      for (const c of [...retrieved, ...direct]) {
        const k = c.name.trim().toLowerCase();
        if (!k || k === sourceKey || excluded.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.push(c);
        if (out.length >= cap) break;
      }
      return out;
    }

    const npcCandidates = merge(
      retrievedNpcs,
      campaignNpcs.filter((n) => !relatedIds.has(n.id)).map((n) => ({ name: n.name, descriptor: n.occupation ?? null })),
      existingNpcKeys,
      MAX_DIRECT_NPCS + retrievedNpcs.length,
    );
    const factionCandidates = merge(
      retrievedFactions,
      campaignFactions.map((f) => ({ name: f.name, descriptor: f.faction_type ?? null })),
      existingFactionKeys,
      MAX_DIRECT_FACTIONS,
    );

    if (npcCandidates.length === 0 && factionCandidates.length === 0) {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "There are no other NPCs or factions in this campaign to connect to yet." }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Prompt ────────────────────────────────────────────────────────────────
    const sourceLines = [
      `Name: ${source.name}`,
      source.race ? `Race: ${source.race}` : "",
      source.occupation ? `Occupation: ${source.occupation}` : "",
      plain(source.personality) ? `Personality: ${plain(source.personality)}` : "",
      plain(source.backstory) ? `Backstory: ${plain(source.backstory)}` : "",
      plain(source.appearance) ? `Appearance: ${plain(source.appearance)}` : "",
    ].filter(Boolean);

    const tieLines = existingTies
      .filter((t) => t.name)
      .map((t) => `${t.name} (${t.type})`);

    const steer = prompt.trim() ? `${wrapUserInput(prompt.trim())}\n\n` : "";
    const userContent =
      `${steer}The NPC to connect:\n---BEGIN NPC---\n${sourceLines.join("\n")}\n---END NPC---` +
      (tieLines.length > 0 ? `\n\nTies this NPC already has (do not repeat them):\n${tieLines.join("\n")}` : "") +
      (existingFactionNames.length > 0 ? `\n\nFactions this NPC already belongs to (do not repeat them):\n${existingFactionNames.join("\n")}` : "") +
      "\n\nCandidates. Every target_name must be copied exactly from one of these lines " +
      "(npc|name|occupation or faction|name|type); the app resolves them back to real records by name.\n" +
      "---BEGIN CANDIDATES---\n" +
      [
        ...npcCandidates.map((c) => `npc|${c.name}|${c.descriptor ?? ""}`),
        ...factionCandidates.map((c) => `faction|${c.name}|${c.descriptor ?? ""}`),
      ].join("\n") +
      "\n---END CANDIDATES---";

    const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

    let textResult: TextResult;
    try {
      textResult = await callText({
        provider: textProvider,
        keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
        model: textModel,
        system: systemContent,
        user: userContent,
        maxTokens: 1200,
      });
    } catch (e) {
      await releaseCredits(admin, reservation.ids);
      if (e instanceof MissingTextKeyError) {
        return new Response("No OpenAI API key configured", { status: 422 });
      }
      console.error("NPC relationship text generation failed:", e);
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

    const suggestions = sanitizeSuggestions(parsed, {
      sourceName: source.name,
      npcNames: npcCandidates.map((c) => c.name),
      factionNames: factionCandidates.map((c) => c.name),
      existingNpcNames,
      existingFactionNames,
    });
    if (suggestions.length === 0) {
      await releaseCredits(admin, reservation.ids);
      return new Response(
        JSON.stringify({ error: "No usable suggestions. Try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    await releaseCredits(admin, reservation.ids);
    await recordGeneration(admin, user.id, LEDGER_REASON, textIsByok, cost, {
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
      JSON.stringify({
        suggestions,
        grounded: retrievedNpcs.length + retrievedFactions.length > 0,
        ai_provenance,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    console.error("NPC relationship suggestion failed:", e);
    return new Response(
      JSON.stringify({ error: "Could not build suggestions, please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
}));
