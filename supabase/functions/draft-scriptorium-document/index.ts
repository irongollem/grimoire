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
import type { AiProvenance } from "../_shared/provenance/types.ts";
import {
  assembleContext,
  buildDraftUserContent,
  buildFactionBlock,
  buildLocationBlock,
  buildNpcBlock,
  buildSessionBlock,
  factionLinkWord,
  parseDraftOutput,
  sessionNoteAllowed,
  subjectRefusal,
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
import { loadWorldBlock } from "../_shared/worldBlockLoad.ts";
import { worldBlockText } from "../_shared/worldBlock.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, rateLimited, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign, type BaseCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";

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

interface DraftCampaign extends BaseCampaign {
  game_system: string | null;
}
// Documents are long: a dossier or recap with headings runs well past the
// ~1k tokens of the other generators.
const MAX_TOKENS = 4000;

const NPC_COLUMNS =
  "id, name, race, occupation, appearance, personality, backstory, player_visible_to, player_visible_fields, disguise_name, disguise_portrait_url, is_revealed, location_id";
const FACTION_COLUMNS = "id, name, faction_type, alignment, description, player_visible_to";
const LOCATION_COLUMNS = "id, name, location_type, description, is_description_shared, player_visible_to, parent_id";
const NOTE_COLUMNS = "id, title, content, session_id, session_real_date, player_visible_to, session:campaign_sessions(number)";

class DraftError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Of these NPCs' own locations, the ids that share their linked NPCs with
 * players (`is_npcs_shared` and shared with at least one player): the second
 * route by which the player projection shows an NPC.
 */
async function npcSharingLocationIds(campaignId: string, npcs: DraftNpc[]): Promise<Set<string>> {
  const ids = [...new Set(npcs.map((n) => n.location_id).filter((id): id is string => !!id))];
  if (!ids.length) return new Set();
  const { data, error } = await admin.from("locations").select("id, is_npcs_shared, player_visible_to")
    .in("id", ids).eq("campaign_id", campaignId);
  if (error) throw new Error(error.message);
  return new Set(
    (data ?? [])
      .filter((l) => l.is_npcs_shared === true && ((l.player_visible_to as string[] | null)?.length ?? 0) > 0)
      .map((l) => l.id as string),
  );
}

/** Reads the subject and its neighbours, all inside `campaignId`, and returns the context block. */
async function gatherContext(req: DraftRequest): Promise<string> {
  const { campaignId, subjectId, audience } = req;

  if (req.subjectType === "npc") {
    const { data: npc, error: npcErr } = await admin.from("npcs").select(NPC_COLUMNS)
      .eq("id", subjectId).eq("campaign_id", campaignId).maybeSingle();
    if (npcErr) throw new Error(npcErr.message);
    if (!npc) throw new DraftError(404, "NPC not found in this campaign");
    const sharing = audience === "players" ? await npcSharingLocationIds(campaignId, [npc as DraftNpc]) : new Set<string>();
    const npcRefusal = subjectRefusal(
      audience, "npc", npc as DraftNpc, !!npc.location_id && sharing.has(npc.location_id as string),
    );
    if (npcRefusal) throw new DraftError(422, npcRefusal);
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
    const locRefusal = subjectRefusal(audience, "location", loc as DraftLocation);
    if (locRefusal) throw new DraftError(422, locRefusal);
    let parentName: string | null = null;
    if (loc.parent_id) {
      const { data: parent, error: parentErr } = await admin.from("locations").select("name, player_visible_to")
        .eq("id", loc.parent_id).eq("campaign_id", campaignId).maybeSingle();
      if (parentErr) throw new Error(parentErr.message);
      // A players draft names the parent only when the parent is shared too.
      parentName = parent && (audience === "dm" || ((parent.player_visible_to as string[] | null)?.length ?? 0) > 0)
        ? parent.name
        : null;
    }
    return assembleContext([buildLocationBlock(loc as DraftLocation, parentName, audience)]);
  }

  if (req.subjectType === "faction") {
    const { data: faction, error: factionErr } = await admin.from("factions").select(FACTION_COLUMNS)
      .eq("id", subjectId).eq("campaign_id", campaignId).maybeSingle();
    if (factionErr) throw new Error(factionErr.message);
    if (!faction) throw new DraftError(404, "Faction not found in this campaign");
    const factionRefusal = subjectRefusal(audience, "faction", faction as DraftFaction);
    if (factionRefusal) throw new DraftError(422, factionRefusal);

    // The faction's ties to places and to other factions, from both ends: a
    // link is stored once, so another faction's stance toward this one sits on
    // its own row and reads "seen as a rival by" from here.
    const linkColumns = "from_kind, to_kind, type, note, from_faction_id, to_faction_id, from_location_id, to_location_id";
    const [npcLinks, outLinks, inLinks] = await Promise.all([
      admin.from("faction_npcs").select("npc_id, role, status").eq("faction_id", subjectId),
      admin.from("world_links").select(linkColumns).eq("campaign_id", campaignId).eq("from_faction_id", subjectId)
        .in("to_kind", ["location", "faction"]),
      admin.from("world_links").select(linkColumns).eq("campaign_id", campaignId).eq("to_faction_id", subjectId)
        .eq("from_kind", "faction"),
    ]);
    for (const res of [npcLinks, outLinks, inLinks]) {
      if (res.error) throw new Error(res.error.message);
    }
    interface FactionTie {
      kind: "location" | "faction";
      otherId: string;
      word: string;
      note: string | null;
    }
    const ties: FactionTie[] = [];
    for (const [rows, factionIsFrom] of [[outLinks.data, true], [inLinks.data, false]] as const) {
      for (const row of rows ?? []) {
        const kind = (factionIsFrom ? row.to_kind : row.from_kind) as "location" | "faction";
        const otherId = (factionIsFrom
          ? (kind === "location" ? row.to_location_id : row.to_faction_id)
          : row.from_faction_id) as string | null;
        const word = factionLinkWord(kind, row.type as string, factionIsFrom);
        if (otherId && word) ties.push({ kind, otherId, word, note: row.note as string | null });
      }
    }
    const npcIds = (npcLinks.data ?? []).map((l) => l.npc_id as string);
    const locIds = ties.filter((t) => t.kind === "location").map((t) => t.otherId);
    const targetIds = ties.filter((t) => t.kind === "faction").map((t) => t.otherId);

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

    const sharing = audience === "players"
      ? await npcSharingLocationIds(campaignId, [...npcById.values()])
      : new Set<string>();
    const members: FactionMember[] = [];
    for (const l of npcLinks.data ?? []) {
      const n = npcById.get(l.npc_id as string);
      if (n) {
        members.push({
          npc: n,
          role: l.role as string | null,
          status: l.status as string | null,
          locationSharesNpcs: !!n.location_id && sharing.has(n.location_id),
        });
      }
    }
    const holdings: FactionHolding[] = [];
    const relations: FactionRelationRow[] = [];
    for (const tie of ties) {
      if (tie.kind === "location") {
        const location = locById.get(tie.otherId);
        if (location) holdings.push({ location, word: tie.word, notes: tie.note });
      } else {
        const target = factionById.get(tie.otherId);
        if (target) relations.push({ target, word: tie.word, notes: tie.note });
      }
    }
    return assembleContext([buildFactionBlock(faction as DraftFaction, members, holdings, relations, audience)]);
  }

  // session: the subject is a note linked to a session (its chronicle entry), siblings are the notes linked to the same session.
  // overrideTypes: without generated types supabase-js reads the many-to-one
  // `session` embed as an array; PostgREST returns one object (or null).
  const { data: note, error: noteErr } = await admin.from("notes").select(NOTE_COLUMNS)
    .eq("id", subjectId).eq("campaign_id", campaignId).not("session_id", "is", null).maybeSingle()
    .overrideTypes<DraftNote, { merge: false }>();
  if (noteErr) throw new Error(noteErr.message);
  if (!note) throw new DraftError(404, "Session not found in this campaign");
  if (!sessionNoteAllowed(note, audience)) {
    throw new DraftError(
      422,
      "This session's notes are not shared with players. Share the note with a player, or draft the recap for the DM.",
    );
  }
  let siblings: DraftNote[] = [];
  if (note.session_id !== null) {
    const { data, error: sibErr } = await admin.from("notes").select(NOTE_COLUMNS)
      .eq("campaign_id", campaignId).eq("session_id", note.session_id).neq("id", subjectId).limit(20)
      .overrideTypes<DraftNote[], { merge: false }>();
    if (sibErr) throw new Error(sibErr.message);
    siblings = data;
  }
  return assembleContext([buildSessionBlock(note, siblings, audience)]);
}


serve(serveUser(async ({ user, req, report }) => {
  // Frozen or child accounts cannot generate (#919).
  const accountRefusal = await generationRefusal(admin, user.id);
  if (accountRefusal) return accountRefusal;

  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", "The request body must be a JSON object.");
  const parsed = validateDraftRequest(body);
  if (!parsed.ok) return jsonError(400, "invalid_body", parsed.error);
  const request = parsed.value;

  if (request.prompt) {
    const promptCheck = validatePromptInput(request.prompt, AI_PROMPT_LIMIT);
    if (!promptCheck.ok) return promptCheck.errorResponse;
  }

  // Owner or a DM-role member ONLY, never any member. The context below is read
  // with the service role and, for a DM-facing draft, includes DM-only NPC,
  // faction and session data; a player calling this directly would otherwise
  // read it. (audience "players" still only limits what the DRAFT contains.)
  const load = await loadAiCampaign<DraftCampaign>(admin, request.campaignId, user.id, {
    columns: ["game_system"],
  });
  if (!load.ok) return load.response;
  const campaign = load.campaign;

  const rulesetKey = rulesetContextKey(campaign.game_system);

  const { data: promptRows, error: promptErr } = await admin
    .from("ai_system_prompts").select("generator_type, content")
    .in("generator_type", [PROMPT_ROW, ...(rulesetKey ? [rulesetKey] : [])]);
  if (promptErr) {
    console.error("Scriptorium draft prompt read failed:", promptErr.message);
    return jsonError(500, "prompt_read_failed", "Could not read the prompt configuration.");
  }
  const promptRow = promptRows?.find((r) => r.generator_type === PROMPT_ROW);
  const rulesetContext =
    promptRows?.find((r) => r.generator_type === rulesetKey)?.content ?? null;
  if (!promptRow) return jsonError(500, "prompt_not_configured", "This generator is not set up yet.");

  const [platformKeys, providerConfigs] = await Promise.all([
    fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
    fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
  ]);
  // Read the grounding BEFORE spending anything: a missing or unshared subject
  // is a refusal, not a charge.
  let contextBlock: string;
  try {
    contextBlock = await gatherContext(request);
  } catch (e) {
    if (e instanceof DraftError) return jsonError(e.status, e.status === 404 ? "subject_not_found" : "not_shared", e.message);
    console.error("Scriptorium draft context failed:", e);
    return jsonError(500, "context_read_failed", "Could not read the campaign data.");
  }

  // The platform picks the model: the provider the admin enabled.
  const text = resolveTextProvider({
    platformKeys,
    providerConfigs,
  });
  if (!text) return jsonError(422, "no_text_provider", NO_TEXT_PROVIDER_MESSAGE);

  const baseCost = await fetchCreditCost(admin, REASON);
  const cost = wholeCredits(
    applyMultiplier(baseCost, text.textMultiplier),
  );

  if (!(await checkRateLimit(admin, user.id, "ai_generation"))) return rateLimited();

  const world = await loadWorldBlock(admin, campaign.id);
  const systemContent = promptRow.content +
    (rulesetContext ? `\n\n${rulesetContext}` : "") +
    worldBlockText(world) + INJECTION_GUARD_SUFFIX;

  const userContent = buildDraftUserContent(
    request.kind,
    request.audience,
    request.prompt ? wrapUserInput(request.prompt) : "",
    contextBlock,
  );

  const textModel = text.config?.text_model;

  return withCreditHold(admin, { payerId: user.id, reason: REASON, cost, report }, async (hold) => {
    let textResult: TextResult;
    try {
      textResult = await callText({
        text,
        model: textModel,
        system: systemContent,
        user: userContent,
        maxTokens: MAX_TOKENS,
      });
    } catch (e) {
      console.error("Scriptorium draft text generation failed:", e);
      return jsonError(502, "generation_failed", e instanceof Error ? e.message : "Text generation failed");
    }

    const draft = parseDraftOutput(textResult.content);
    if (!draft) {
      return jsonError(502, "generation_failed", "The AI returned a malformed document. Nothing was charged; please try again.");
    }

    hold.charge(REASON, {
      cost,
      log: {
        model: textResult.usage.model, provider: textResult.usage.provider,
        input_tokens: textResult.usage.input_tokens, output_tokens: textResult.usage.output_tokens,
      },
    });

    const ai_provenance: AiProvenance = {
      generatorType: REASON,
      provider: textResult.usage.provider,
      model: textResult.usage.model,
      generatedAt: new Date().toISOString(),
      edited: false,
    };

    return json({ title: draft.title, html: draft.html, ai_provenance });
  });
}));
