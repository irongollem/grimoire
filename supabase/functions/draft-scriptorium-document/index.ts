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
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  AI_PROMPT_LIMIT,
  INJECTION_GUARD_SUFFIX,
  validatePromptInput,
  wrapUserInput,
} from "../_shared/ai-prompt.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { callText, MissingTextKeyError, type TextResult } from "../_shared/textGen.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import {
  assembleContext,
  buildDraftUserContent,
  buildFactionBlock,
  buildLocationBlock,
  buildNpcBlock,
  buildSessionBlock,
  parseDraftOutput,
  sessionNoteAllowed,
  validateDraftRequest,
  type DraftFaction,
  type DraftLocation,
  type DraftNote,
  type DraftNpc,
  type DraftRequest,
  type FactionHolding,
  type FactionMember,
  type FactionRelationRow,
} from "../_shared/scriptoriumDraft.ts";

/**
 * Scriptorium document drafting (epic #910, story S12).
 *
 * Three kinds (player handout, faction dossier, session recap packet), one
 * prompt row (`scriptorium_draft`); the kind and audience travel in the user
 * content. Grounded by reading the campaign's own rows with the admin client,
 * ALWAYS filtered by `campaign_id`: a subject id from the client is only ever a
 * lookup key inside the caller's campaign, never trusted on its own. What a
 * player-facing draft may contain is decided in `_shared/scriptoriumDraft.ts`.
 *
 * Server-path only: the grounding needs service-role reads the browser cannot
 * make. The response is a DRAFT ({ title, html }); the client turns it into a
 * Scriptorium document the DM then edits.
 */

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PROMPT_ROW = "scriptorium_draft";
const REASON = "scriptorium_draft";
// Documents are long: a dossier or recap with headings runs well past the
// ~1k tokens of the other generators.
const MAX_TOKENS = 4000;

const NPC_COLUMNS = "id, name, race, occupation, appearance, personality, backstory, player_visible_to";
const FACTION_COLUMNS = "id, name, faction_type, alignment, description, player_visible_to";
const LOCATION_COLUMNS = "id, name, location_type, description, is_description_shared, player_visible_to, parent_id";
const NOTE_COLUMNS = "id, title, content, session_num, session_real_date, player_visible_to";

class DraftError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function buildCampaignContext(setting: string | null | undefined): string {
  const s = setting?.trim();
  if (!s) return "";
  return `\n\nCampaign context provided by the DM (use it to ground tone, names, factions, and themes — but do not invent new facts that contradict it):\n\n## Setting\n${s}`;
}

/** Reads the subject and its neighbours, all inside `campaignId`, and returns the context block. */
async function gatherContext(req: DraftRequest): Promise<string> {
  const { campaignId, subjectId, audience } = req;

  if (req.subjectType === "npc") {
    const { data: npc, error: npcErr } = await admin.from("npcs").select(NPC_COLUMNS)
      .eq("id", subjectId).eq("campaign_id", campaignId).maybeSingle();
    if (npcErr) throw new Error(npcErr.message);
    if (!npc) throw new DraftError(404, "NPC not found in this campaign");
    const { data: links, error: linksErr } = await admin.from("faction_npcs").select("faction_id").eq("npc_id", subjectId);
    if (linksErr) throw new Error(linksErr.message);
    const factionIds = (links ?? []).map((l) => l.faction_id as string);
    const { data: factions, error: factionsErr } = factionIds.length
      ? await admin.from("factions").select(FACTION_COLUMNS).in("id", factionIds).eq("campaign_id", campaignId)
      : { data: [], error: null };
    if (factionsErr) throw new Error(factionsErr.message);
    return assembleContext([buildNpcBlock(npc as DraftNpc, (factions ?? []) as DraftFaction[], audience)]);
  }

  if (req.subjectType === "location") {
    const { data: loc, error: locErr } = await admin.from("locations").select(LOCATION_COLUMNS)
      .eq("id", subjectId).eq("campaign_id", campaignId).maybeSingle();
    if (locErr) throw new Error(locErr.message);
    if (!loc) throw new DraftError(404, "Location not found in this campaign");
    let parentName: string | null = null;
    if (loc.parent_id) {
      const { data: parent, error: parentErr } = await admin.from("locations").select("name")
        .eq("id", loc.parent_id).eq("campaign_id", campaignId).maybeSingle();
      if (parentErr) throw new Error(parentErr.message);
      parentName = parent?.name ?? null;
    }
    return assembleContext([buildLocationBlock(loc as DraftLocation, parentName, audience)]);
  }

  if (req.subjectType === "faction") {
    const { data: faction, error: factionErr } = await admin.from("factions").select(FACTION_COLUMNS)
      .eq("id", subjectId).eq("campaign_id", campaignId).maybeSingle();
    if (factionErr) throw new Error(factionErr.message);
    if (!faction) throw new DraftError(404, "Faction not found in this campaign");

    const [npcLinks, locLinks, relLinks] = await Promise.all([
      admin.from("faction_npcs").select("npc_id, role, status").eq("faction_id", subjectId),
      admin.from("faction_locations").select("location_id, notes").eq("faction_id", subjectId),
      admin.from("faction_relations").select("target_faction_id, relation_type, notes").eq("faction_id", subjectId),
    ]);
    for (const res of [npcLinks, locLinks, relLinks]) {
      if (res.error) throw new Error(res.error.message);
    }
    const npcIds = (npcLinks.data ?? []).map((l) => l.npc_id as string);
    const locIds = (locLinks.data ?? []).map((l) => l.location_id as string);
    const targetIds = (relLinks.data ?? []).map((l) => l.target_faction_id as string);

    const [npcs, locations, targets] = await Promise.all([
      npcIds.length ? admin.from("npcs").select(NPC_COLUMNS).in("id", npcIds).eq("campaign_id", campaignId) : { data: [], error: null },
      locIds.length ? admin.from("locations").select(LOCATION_COLUMNS).in("id", locIds).eq("campaign_id", campaignId) : { data: [], error: null },
      targetIds.length ? admin.from("factions").select(FACTION_COLUMNS).in("id", targetIds).eq("campaign_id", campaignId) : { data: [], error: null },
    ]);
    for (const res of [npcs, locations, targets]) {
      if (res.error) throw new Error(res.error.message);
    }
    const npcById = new Map(((npcs.data ?? []) as DraftNpc[]).map((n) => [n.id, n]));
    const locById = new Map(((locations.data ?? []) as DraftLocation[]).map((l) => [l.id, l]));
    const factionById = new Map(((targets.data ?? []) as DraftFaction[]).map((f) => [f.id, f]));

    const members: FactionMember[] = [];
    for (const l of npcLinks.data ?? []) {
      const n = npcById.get(l.npc_id as string);
      if (n) members.push({ npc: n, role: l.role as string | null, status: l.status as string | null });
    }
    const holdings: FactionHolding[] = [];
    for (const l of locLinks.data ?? []) {
      const loc = locById.get(l.location_id as string);
      if (loc) holdings.push({ location: loc, notes: l.notes as string | null });
    }
    const relations: FactionRelationRow[] = [];
    for (const l of relLinks.data ?? []) {
      const target = factionById.get(l.target_faction_id as string);
      if (target) relations.push({ target, relation_type: l.relation_type as string, notes: l.notes as string | null });
    }
    return assembleContext([buildFactionBlock(faction as DraftFaction, members, holdings, relations, audience)]);
  }

  // session: the subject is a session-category note, siblings share its number.
  const { data: note, error: noteErr } = await admin.from("notes").select(NOTE_COLUMNS)
    .eq("id", subjectId).eq("campaign_id", campaignId).eq("category", "session").maybeSingle();
  if (noteErr) throw new Error(noteErr.message);
  if (!note) throw new DraftError(404, "Session not found in this campaign");
  if (!sessionNoteAllowed(note as DraftNote, audience)) {
    throw new DraftError(
      422,
      "This session's notes are not shared with players. Share the note with a player, or draft the recap for the DM.",
    );
  }
  let siblings: DraftNote[] = [];
  if (note.session_num !== null) {
    const { data, error: sibErr } = await admin.from("notes").select(NOTE_COLUMNS)
      .eq("campaign_id", campaignId).eq("session_num", note.session_num).neq("id", subjectId).limit(20);
    if (sibErr) throw new Error(sibErr.message);
    siblings = (data ?? []) as DraftNote[];
  }
  return assembleContext([buildSessionBlock(note as DraftNote, siblings, audience)]);
}

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });

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

  // Frozen or child accounts cannot generate, BYOK included (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid body", { status: 400 });
  }
  const parsed = validateDraftRequest(body);
  if (!parsed.ok) return new Response(`Invalid body: ${parsed.error}`, { status: 400 });
  const request = parsed.value;

  if (request.prompt) {
    const promptCheck = validatePromptInput(request.prompt, AI_PROMPT_LIMIT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  const { data: campaign, error: campaignErr } = await admin
    .from("campaigns")
    .select("id, user_id, ai_enabled, text_provider, ai_setting_prompt, ruleset, openai_api_key, anthropic_api_key, gemini_api_key")
    .eq("id", request.campaignId)
    .maybeSingle();
  if (campaignErr) {
    console.error("Scriptorium draft campaign read failed:", campaignErr.message);
    return jsonError(500, "Could not read the campaign");
  }
  if (!campaign) return new Response("Campaign not found", { status: 404 });
  if (campaign.ai_enabled !== true) return new Response("AI is disabled for this campaign", { status: 403 });

  // Owner or a DM-role member ONLY, never any member. The context below is read
  // with the service role and, for a DM-facing draft, includes DM-only NPC,
  // faction and session data; a player calling this directly would otherwise
  // read it. (audience "players" still only limits what the DRAFT contains.)
  if (!(await isCampaignDm(admin, campaign, user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const ruleset = campaign.ruleset === "2024" ? "2024" : "2014";

  const { data: promptRows, error: promptErr } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [PROMPT_ROW, `ruleset_context_${ruleset}`]);
  if (promptErr) {
    console.error("Scriptorium draft prompt read failed:", promptErr.message);
    return jsonError(500, "Could not read the prompt configuration");
  }
  const promptRow = promptRows?.find((r) => r.generator_type === PROMPT_ROW);
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === `ruleset_context_${ruleset}`)?.content ?? null;
  if (!promptRow) return new Response("Prompt not configured", { status: 500 });

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

  // Read the grounding BEFORE spending anything: a missing or unshared subject
  // is a refusal, not a charge.
  let contextBlock: string;
  try {
    contextBlock = await gatherContext(request);
  } catch (e) {
    if (e instanceof DraftError) return jsonError(e.status, e.message);
    console.error("Scriptorium draft context failed:", e);
    return jsonError(500, "Could not read the campaign data");
  }

  const textProvider = campaign.text_provider ?? "openai";
  const textIsByok = textProvider === "anthropic" ? !!campaignAnthropic
    : textProvider === "gemini"    ? !!campaignGemini
    : !!campaignOpenai;

  const baseCost = textIsByok ? 0 : await fetchCreditCost(admin, REASON);
  const cost = wholeCredits(
    applyMultiplier(baseCost, providerConfigs[textProvider as keyof typeof providerConfigs]?.text_multiplier),
  );

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) {
    return jsonError(429, "rate_limited");
  }

  const reservation = await reserveCredits(admin, user.id, cost, REASON);
  if (!reservation.ok) return reservationFailureResponse(reservation);

  const userContent = buildDraftUserContent(
    request.kind,
    request.audience,
    request.prompt ? wrapUserInput(request.prompt) : "",
    contextBlock,
  );

  const textModel = providerConfigs[textProvider as keyof typeof providerConfigs]?.text_model;

  let textResult: TextResult;
  try {
    textResult = await callText({
      provider: textProvider,
      keys: { openai: openaiKey, anthropic: anthropicKey, gemini: geminiKey },
      model: textModel,
      system: systemContent,
      user: userContent,
      maxTokens: MAX_TOKENS,
    });
  } catch (e) {
    await releaseCredits(admin, reservation.ids);
    if (e instanceof MissingTextKeyError) {
      return new Response("No OpenAI API key configured", { status: 422 });
    }
    console.error("Scriptorium draft text generation failed:", e);
    return jsonError(502, e instanceof Error ? e.message : "Text generation failed");
  }

  const draft = parseDraftOutput(textResult.content);
  if (!draft) {
    await releaseCredits(admin, reservation.ids);
    return jsonError(502, "AI returned a malformed document, please try again.");
  }

  await releaseCredits(admin, reservation.ids);
  await recordGeneration(admin, user.id, REASON, textIsByok, cost, {
    model: textResult.usage.model, provider: textResult.usage.provider,
    input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
  });

  const ai_provenance: AiProvenance = {
    generatorType: REASON,
    provider: textResult.usage.provider,
    model: textResult.usage.model,
    generatedAt: new Date().toISOString(),
    edited: false,
  };

  return new Response(
    JSON.stringify({ title: draft.title, html: draft.html, ai_provenance }),
    { headers: { "Content-Type": "application/json" } },
  );
}));
