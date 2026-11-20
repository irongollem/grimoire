// agent-turn (#1205): runs one turn of a conversation with the AI table and streams it.
//
// The rules are `handler.ts`'s; this file wires the database, the provider and the MCP tools to them. The gates
// run before the stream opens so a refusal is a real status code; the turn itself runs inside the stream.
import type { AgentProvider } from "../_shared/agent/providerIo.ts";
import { loadTurnsInReach } from "../_shared/agent/turnsInReach.ts";
import { giveHandout, loadHandouts, loadPicture } from "./showIo.ts";
import { CHILD_TURN_THRESHOLDS, readsAsChild, STRIKE_WINDOW_DAYS } from "../_shared/agent/conduct.ts";
import { belongingsText, MAX_BELONGINGS, type Belonging } from "../_shared/agent/belongings.ts";
import { MAX_PEOPLES } from "../_shared/agent/peoples.ts";
import { lineKey } from "../_shared/agent/lineKey.ts";
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { speechEnvFrom, voicesOn } from "../_shared/speech.ts";
import { tableAiEnabled } from "../_shared/featureAccess.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import {
  recordFreeGeneration,
  recordGeneration,
  releaseCredits,
  reservationRefusal,
  reserveCredits,
  type CreditLogFields,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { isPromptRejected, screenImagePrompt } from "../_shared/moderation.ts";
import { callTool, listTools } from "../_shared/mcp/tools.ts";
import type { ToolContext } from "../_shared/mcp/tools.ts";
import { ENTITY_TYPES } from "../_shared/mcp/registry.ts";
import { companionProfile, companionSpeaks, COMPANIONS_MAX, type Companion } from "../_shared/agent/companions.ts";
import { hazardFromRow, type KeptHazard } from "../_shared/agent/hazard.ts";
import { agentToolsFrom, bindTools, SOLO_TABLE_TOOLS, TABLE_REFUSED_TYPES } from "../_shared/agent/mcpTools.ts";
import { buildNpcProfile, NPC_PROFILE_COLUMNS, shownNpcName, type NpcProfileRow } from "../_shared/npcProfile.ts";
import { campaignToday } from "../_shared/npcAge.ts";
import { BESIDE_MAX, PLACES_MAX, CHARACTERS_MAX, type SceneView } from "../_shared/agent/scene.ts";
import { formatNpcMemories, loadPromptMemories } from "../_shared/npcMemories.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { loadPartyMember } from "../_shared/agent/characterIo.ts";
import { secureDie } from "../_shared/serverRoll.ts";
import type { RecordedFact } from "../_shared/agent/record.ts";
import { revealToCharacter } from "./revealIo.ts";
import { makeHandsStore } from "./handsIo.ts";
import { finishFight, layFightLoot, loadFights, setFight, setPursuit, startFight, statlessFighters } from "./fightIo.ts";
import type { Prologue } from "../_shared/agent/prologue.ts";
import { loadAgentCalibration, loadModelPrice, resolveAgentProvider } from "../_shared/agent/providerIo.ts";
import { applyQuestMove, loadQuests } from "./questIo.ts";
import { CANON_JUDGE_TIMEOUT_MS, narrationJudgeFor } from "./narrationJudge.ts";
import { canonStore } from "./canonIo.ts";
import { EmbeddingProviderConfigError, resolveEmbeddingProvider } from "../_shared/embeddings.ts";
import type { TurnRow } from "../_shared/agent/transcript.ts";
import { beginTurn } from "./handler.ts";
import { candidateFactIds, factFailure, NEWEST_FACTS, openFacts, recordFrom, recordTies, sessionIdsOf, sessionNumbers } from "./recordRows.ts";
import { sceneFrom } from "./sceneRows.ts";
import { travelMapFrom } from "./travelRows.ts";
import { afterUse, asCompanion, characterInsert, characterRewrite, companionMemoriesText, companionRows, foundCharacters, isUntouchedTableCharacter, memoryRowsFor, profileWithBelongings } from "./characterRows.ts";
import { escapeLike } from "./likeEscape.ts";
import { nextSessionNumber, openedSession, prologueFrom, sessionRow, wholeCredits } from "./sessionRows.ts";
import type { AgentEvent, AgentTurnDeps, CampaignRow, Refusal, SessionRow } from "./turnTypes.ts";

/** How many of a party member's memories their own call is given: the newest. */
const COMPANION_MEMORIES = 12;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SESSION_COLUMNS = "id, user_id, campaign_id, summary, summary_through_seq, scene_location_id, campaign_session_id, pressure_clock_id, party_member_id, opened_play_session, left_at, pending_roll, fight_encounter_id, pursuit_encounter_id, updated_at";

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  // The tools run as the caller, through their own RLS client, exactly as the MCP server runs them. The service
  // client is made only when `roll` asks for it (its server_rolled stamp, which RLS can never let a caller write).
  let service: ReturnType<typeof createClient> | undefined;
  const ctx: ToolContext = {
    supabase,
    userId: user.id,
    email: user.email,
    serviceClient: () => {
      service ??= createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return service;
    },
  };

  // What resolveProvider found, kept for the moderation key.
  let moderationKey: string | null = null;
  let rawCampaign: Record<string, unknown> | null = null;
  // The campaign the conversation is in, set when the handler loads it; the tools are pinned to it.
  let pinnedCampaignId: string | null = null;

  // A party member as a speaker: only one whose player said the AI may speak for them and whose sheet says who
  // they are (`companionSpeaks`). Anyone else is "no such speaker", and the narrator tells what they do instead.
  async function loadCompanionSpeaker(campaignId: string, memberId: string) {
    const flag = await admin.from("party_members").select("id, ai_speaks").eq("id", memberId).eq("campaign_id", campaignId).maybeSingle();
    if (flag.error) throw flag.error;
    if (!flag.data) return null;
    const member = await loadPartyMember(admin, campaignId, memberId);
    if (member === null) return null;
    const companion: Companion = { ...member, aiSpeaks: flag.data.ai_speaks === true };
    if (!companionSpeaks(companion)) return null;
    const lived = await admin.from("party_member_memories").select("kind, body").eq("party_member_id", memberId).eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(COMPANION_MEMORIES);
    if (lived.error) throw lived.error;
    return {
      id: member.id,
      shownName: member.name,
      profile: companionProfile(companion),
      memories: companionMemoriesText(lived.data ?? []),
    };
  }

  const deps: AgentTurnDeps = {
    async accountRefusal(userId): Promise<Refusal | null> {
      // Fail closed: a conversation with a model is not something to allow on a lookup that could not be made.
      const refusal = await generationRefusal(admin, userId, { failClosed: true });
      if (!refusal) return null;
      const detail = await refusal.json().catch(() => ({}));
      return { status: refusal.status, error: typeof detail?.error === "string" ? detail.error : "refused" };
    },

    async loadCampaign(campaignId): Promise<CampaignRow | null> {
      const { data, error } = await admin
        .from("campaigns")
        .select("id, user_id, name, ai_enabled, game_system, text_provider, current_year, current_month, current_day")
        .eq("id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      rawCampaign = data;
      pinnedCampaignId = data.id as string;
      return {
        id: data.id,
        user_id: data.user_id,
        name: data.name,
        game_system: data.game_system,
        ai_enabled: await tableAiEnabled(admin, data),
      };
    },

    isDm: (campaign, userId) => isCampaignDm(admin, campaign, userId),
    now: () => Date.now(),

    // The campaign's own hazard of that name first, then the library's: what exists is used before anything is made.
    async findHazard(campaignId, name): Promise<KeptHazard | null> {
      const exact = escapeLike(name);
      const columns = "name, effect_description, save_type, save_dc, damage_entries";
      const own = await admin.from("traps").select(columns).eq("campaign_id", campaignId).ilike("name", exact).limit(1).maybeSingle();
      if (own.error) throw own.error;
      if (own.data) return hazardFromRow(own.data, "campaign");
      const shared = await admin.from("library_traps").select(columns).ilike("name", exact).limit(1).maybeSingle();
      if (shared.error) throw shared.error;
      return shared.data ? hazardFromRow(shared.data, "library") : null;
    },

    // A record of the campaign like any hazard the DM writes in Dungeon Craft, marked as made at the AI table.
    async makeHazard({ campaignId, userId, provider, model }, hazard): Promise<void> {
      const { error } = await admin.from("traps").insert({
        user_id: userId,
        campaign_id: campaignId,
        name: hazard.name,
        trap_type: "Environmental",
        effect_description: hazard.effect,
        save_type: hazard.save,
        save_dc: hazard.dc,
        damage_entries: hazard.damage,
        damage_immunities: [],
        ai_provenance: { generatorType: "agent_table_hazard", provider, model, generatedAt: new Date().toISOString(), edited: false },
      });
      if (error) throw error;
    },

    async loadSession(sessionId): Promise<SessionRow | null> {
      const { data, error } = await admin.from("agent_sessions").select(SESSION_COLUMNS).eq("id", sessionId).maybeSingle();
      if (error) throw error;
      return data ? sessionRow(data) : null;
    },

    // Through the caller's own client: `start_campaign_session` is the function the app's Start button calls, it
    // checks that the caller is this campaign's DM, and it returns the open session untouched when there is one
    // (a DM already running an evening keeps it, and the table joins it). A new session takes the next number.
    async openPlaySession(campaignId): Promise<{ id: string; opened: boolean } | null> {
      // Read before the call: the function answers the open session untouched, so the answer alone cannot say who started it.
      const { data: running, error: runningError } = await supabase
        .from("campaign_sessions")
        .select("id")
        .eq("campaign_id", campaignId)
        .not("started_at", "is", null)
        .is("ended_at", null)
        .limit(1);
      if (runningError) throw runningError;
      const { data: last, error: lastError } = await supabase
        .from("campaign_sessions")
        .select("number")
        .eq("campaign_id", campaignId)
        .not("number", "is", null)
        .order("number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) throw lastError;
      const { data, error } = await supabase.rpc("start_campaign_session", { p_campaign_id: campaignId, p_number: nextSessionNumber(last) });
      if (error) throw error;
      return openedSession(data, running);
    },

    async createSession({ userId, campaignId, provider, model, sceneLocationId, campaignSessionId, openedPlaySession, partyMemberId, narratorVoice }): Promise<SessionRow> {
      const { data, error } = await admin
        .from("agent_sessions")
        .insert({
          user_id: userId,
          campaign_id: campaignId,
          kind: "solo_table",
          provider,
          model,
          scene_location_id: sceneLocationId,
          campaign_session_id: campaignSessionId,
          opened_play_session: openedPlaySession,
          party_member_id: partyMemberId,
          // Left out when the page named none, so the column's own default decides and is said in one place.
          ...(narratorVoice === null ? {} : { narrator_voice: narratorVoice }),
        })
        .select(SESSION_COLUMNS)
        .single();
      if (error) throw error;
      return sessionRow(data);
    },

    loadTurns: (sessionId, summaryThroughSeq) => loadTurnsInReach(admin, sessionId, summaryThroughSeq),

    rateLimit: (userId) => checkRateLimit(admin, userId, "agent_turn"),

    // The campaign's text provider, the model's price and what a credit is worth: the same lookups a told recap
    // uses (`_shared/agent/providerIo.ts`).
    async resolveProvider(campaign): Promise<AgentProvider | null> {
      if (!rawCampaign) return null;
      const resolved = await resolveAgentProvider(admin, { id: campaign.id, ownerId: campaign.user_id, textProvider: rawCampaign.text_provider as string | null });
      if (resolved === null) return null;
      moderationKey = resolved.moderationKey;
      return resolved.provider;
    },

    loadPrice: (model) => loadModelPrice(admin, model),

    loadCalibration: () => loadAgentCalibration(admin),

    async isFlagged(message) {
      try {
        await screenImagePrompt(message, {
          apiKey: moderationKey,
          admin,
          userId: user.id,
          generationType: "agent_turn",
          imageProvider: "none",
        });
        return false;
      } catch (error) {
        if (isPromptRejected(error)) return true;
        throw error;
      }
    },

    // What the screen refused of this account's own messages, lately. Only what they sent counts: a turn of the
    // Dungeon Master's that was withheld is not the player's strike.
    async strikes(userId) {
      const since = new Date(Date.now() - STRIKE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await admin
        .from("prompt_screenings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("generation_type", "agent_turn")
        .eq("blocked", true)
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },

    async isFlaggedOutput(text, childTookPart) {
      try {
        await screenImagePrompt(text, {
          apiKey: moderationKey,
          admin,
          userId: user.id,
          generationType: "agent_turn_output",
          imageProvider: "none",
          tighter: childTookPart ? CHILD_TURN_THRESHOLDS : undefined,
        });
        return false;
      } catch (error) {
        if (isPromptRejected(error)) return true;
        throw error;
      }
    },

    async anyChild(campaignId, characterIds) {
      const { data, error } = await admin.from("npcs").select("age").eq("campaign_id", campaignId).in("id", characterIds);
      if (error) throw error;
      return (data ?? []).some((row) => readsAsChild(typeof row.age === "string" ? row.age : null));
    },

    async reserve(userId, credits) {
      const reservation = await reserveCredits(admin, userId, credits, "agent_turn");
      if (reservation.ok) return { ok: true, ids: reservation.ids };
      return { ok: false, refusal: reservationRefusal(reservation, "The AI table cannot be metered right now.") };
    },

    release: (ids) => releaseCredits(admin, ids),

    recordGeneration: (isByok: boolean, cost: number, log: CreditLogFields) =>
      recordGeneration(admin, user.id, "agent_turn", isByok, cost, log),

    recordFreeGeneration: (log: CreditLogFields) => recordFreeGeneration(admin, user.id, "agent_turn", log),

    async appendTurns(sessionId, afterSeq, rows: TurnRow[], credits) {
      const { data, error } = await admin.rpc("append_agent_turns", {
        p_session_id: sessionId,
        p_after_seq: afterSeq,
        p_rows: rows,
        p_credits: credits,
      });
      if (error) {
        if (error.code === "40001") return "conflict";
        throw error;
      }
      return { due: wholeCredits(data) };
    },

    async saveSummary({ sessionId, expectedThroughSeq, throughSeq, summary, usage, credits }) {
      const { data, error } = await admin.rpc("summarise_agent_session", {
        p_session_id: sessionId,
        p_expected_through_seq: expectedThroughSeq,
        p_through_seq: throughSeq,
        p_summary: summary,
        p_input_tokens: usage.inputTokens,
        p_output_tokens: usage.outputTokens,
        p_cache_read_tokens: usage.cacheReadTokens,
        p_cache_write_tokens: usage.cacheWriteTokens,
        p_credits: credits,
      });
      if (error) {
        if (error.code === "40001") return "stale";
        throw error;
      }
      return { due: wholeCredits(data) };
    },

    // One character, for its own call: the same profile and memory block the Voice Coach sends, so a disguised
    // character's true name is withheld here as it is there. Read with the service role after the handler has
    // checked the caller is this campaign's DM; the campaign filter is in the query, so an id from another
    // campaign is simply not found.
    async loadSpeaker(campaignId, characterId) {
      const { data, error } = await admin
        .from("npcs")
        .select(NPC_PROFILE_COLUMNS)
        .eq("id", characterId)
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error) throw error;
      // Not a character of the campaign's: one of the party, perhaps, played while their own player is away.
      if (!data) return loadCompanionSpeaker(campaignId, characterId);
      const npc = data as unknown as NpcProfileRow;
      const [memories, carried] = await Promise.all([
        loadPromptMemories(admin, npc.id, campaignId),
        admin.from("npc_inventory").select("name, quantity").eq("npc_id", npc.id).eq("campaign_id", campaignId).order("name").limit(MAX_BELONGINGS + 1),
      ]);
      if (carried.error) throw carried.error;
      const belongings = belongingsText((carried.data ?? []) as Belonging[]);
      return {
        id: npc.id,
        shownName: shownNpcName(npc),
        profile: profileWithBelongings(buildNpcProfile(npc, campaignToday(rawCampaign)), belongings),
        memories: formatNpcMemories(memories, npc),
      };
    },

    loadCharacter: (campaignId, characterId) => loadPartyMember(admin, campaignId, characterId),

    async loadCompanions(campaignId, playedId) {
      const { data, error } = await admin.from("party_members").select("id, ai_speaks").eq("campaign_id", campaignId).order("sort_order", { ascending: true }).limit(COMPANIONS_MAX + 1);
      if (error) throw error;
      const loaded = await Promise.all(companionRows(data ?? [], playedId).map(async (row) => {
        const member = await loadPartyMember(admin, campaignId, row.id as string);
        return member === null ? null : asCompanion(member, row);
      }));
      return loaded.filter((c): c is Companion => c !== null);
    },

    // A place of this campaign and who is in it. One more than the trim keeps of each list, so the trim can tell the
    // narrator there are more. The campaign filter is in every query: an id from another campaign is not found.
    async loadScene(campaignId, locationId): Promise<SceneView | null> {
      const { data: place, error } = await admin
        .from("locations")
        .select("id, parent_id, name, location_type, description")
        .eq("id", locationId)
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!place) return null;
      const [parent, children, people, siblings] = await Promise.all([
        place.parent_id
          ? admin.from("locations").select("name").eq("id", place.parent_id).eq("campaign_id", campaignId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        admin.from("locations").select("id, name").eq("parent_id", place.id).eq("campaign_id", campaignId)
          .order("name", { ascending: true }).limit(PLACES_MAX + 1),
        admin.from("npcs").select("id, name, occupation, disguise_name, is_revealed").eq("location_id", place.id)
          .eq("campaign_id", campaignId).order("name", { ascending: true }).limit(CHARACTERS_MAX + 1),
        // The rooms beside this one: the other places inside the same place.
        place.parent_id
          ? admin.from("locations").select("id, name").eq("parent_id", place.parent_id).eq("campaign_id", campaignId).neq("id", place.id)
            .order("name", { ascending: true }).limit(BESIDE_MAX + 1)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (siblings.error) throw siblings.error;
      if (parent.error) throw parent.error;
      if (children.error) throw children.error;
      if (people.error) throw people.error;
      return sceneFrom(place, parent.data, siblings.data ?? [], children.data ?? [], people.data ?? []);
    },

    async setPendingRoll(sessionId, campaignId, pending): Promise<void> {
      const { error } = await admin
        .from("agent_sessions")
        .update({ pending_roll: pending })
        .eq("id", sessionId)
        .eq("campaign_id", campaignId);
      if (error) throw error;
    },

    async setScene(sessionId, campaignId, locationId): Promise<SceneView | null> {
      // Checked before anything is written: the model can name any id it has seen, and this client is the service
      // role, which the shared same-campaign trigger lets through. The column's own trigger refuses it too.
      const scene = await deps.loadScene(campaignId, locationId);
      if (!scene) return null;
      const { error } = await admin
        .from("agent_sessions")
        .update({ scene_location_id: locationId })
        .eq("id", sessionId)
        .eq("campaign_id", campaignId);
      if (error) {
        console.error("agent-turn: moving the party failed:", error);
        return null;
      }
      return scene;
    },

    // Into the same ledger the DM and the Voice Coach write, so the NPC's page shows them and the character's next
    // call reads them. `campaign_id` is set from the NPC by the table's own trigger; the filter on the NPC's
    // campaign is here because the ids came out of a model's tool call.
    async saveMemories({ campaignId, userId, provider, model, memories, campaignSessionId }) {
      const ids = [...new Set(memories.map((m) => m.characterId))];
      // The ids came out of a model's tool call: each is kept only where it is a character, or a party member, of
      // this campaign, and goes to that one's own ledger.
      const [known, party] = await Promise.all([
        admin.from("npcs").select("id").in("id", ids).eq("campaign_id", campaignId),
        admin.from("party_members").select("id").in("id", ids).eq("campaign_id", campaignId),
      ]);
      if (known.error) throw known.error;
      if (party.error) throw party.error;
      const npcIds = new Set((known.data ?? []).map((n) => n.id as string));
      const memberIds = new Set((party.data ?? []).map((n) => n.id as string));
      const provenance: AiProvenance = {
        generatorType: "agent_turn_memory",
        provider,
        model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };
      const { npcRows, memberRows } = memoryRowsFor({ memories, npcIds, memberIds, campaignId, userId, campaignSessionId, provenance });
      if (npcRows.length > 0) {
        const { error } = await admin.from("npc_memories").insert(npcRows);
        if (error) throw error;
      }
      if (memberRows.length > 0) {
        const { error } = await admin.from("party_member_memories").insert(memberRows);
        if (error) throw error;
      }
    },

    // The record. Read and written through the caller's own client, never the service role: the database refuses a
    // tie to a row of another campaign only when the writer is a signed-in user, and a model chose these ids.
    // Candidates are what is tied to this place or these people, plus the campaign's newest facts, so something
    // filed just now about somewhere else still reaches the narrator.
    async loadRecord(campaignId, about): Promise<RecordedFact[]> {
      const ties = recordTies(about);
      const [linked, newest] = await Promise.all([
        ties === null
          ? Promise.resolve({ data: [] as Array<{ fact_id: string }>, error: null })
          : supabase.from("story_fact_links").select("fact_id").eq("campaign_id", campaignId).or(ties),
        supabase.from("story_facts").select("id").eq("campaign_id", campaignId).is("struck_at", null)
          .order("created_at", { ascending: false }).limit(NEWEST_FACTS),
      ]);
      if (linked.error) throw linked.error;
      if (newest.error) throw newest.error;
      const ids = candidateFactIds(linked.data ?? [], newest.data ?? []);
      if (ids.length === 0) return [];

      const [facts, closers] = await Promise.all([
        supabase.from("story_facts").select("id, body, known_to_player, session_id, created_at, struck_at")
          .eq("campaign_id", campaignId).in("id", ids),
        supabase.from("story_facts").select("supersedes_id, struck_at").eq("campaign_id", campaignId).in("supersedes_id", ids),
      ]);
      if (facts.error) throw facts.error;
      if (closers.error) throw closers.error;
      const open = openFacts(facts.data ?? [], closers.data ?? []);

      const sessionIds = sessionIdsOf(open);
      let numbers = new Map<string, number>();
      if (sessionIds.length > 0) {
        const { data, error } = await supabase.from("campaign_sessions").select("id, number")
          .eq("campaign_id", campaignId).in("id", sessionIds);
        if (error) throw error;
        numbers = sessionNumbers(data ?? []);
      }

      return recordFrom(open, numbers);
    },

    async fileFact({ campaignId, campaignSessionId, agentSessionId, provider, model, fact, about, hidden, closes }) {
      const provenance: AiProvenance = {
        generatorType: "agent_turn_fact",
        provider,
        model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };
      const { data, error } = await supabase
        .from("story_facts")
        .insert({
          campaign_id: campaignId,
          session_id: campaignSessionId,
          agent_session_id: agentSessionId,
          body: fact,
          known_to_player: !hidden,
          supersedes_id: closes,
          source: "table",
          ai_provenance: provenance,
        })
        .select("id")
        .single();
      if (error || !data) {
        console.error("agent-turn: filing a fact failed:", error);
        // A `closes` that is not a fact of this campaign is the one failure the narrator can fix.
        return { error: factFailure(closes, error?.code) };
      }
      const factId = data.id as string;
      if (about.length > 0) {
        const { error: linkError } = await supabase.from("story_fact_links").insert(
          about.map((a) => ({ fact_id: factId, campaign_id: campaignId, kind: a.type, [`${a.type}_id`]: a.id })),
        );
        if (linkError) {
          console.error("agent-turn: tying a fact failed:", linkError);
          // Never leave a fact without the ties it was filed with: it would never be found again.
          const { error: undoError } = await supabase.from("story_facts").delete().eq("id", factId).eq("campaign_id", campaignId);
          if (undoError) console.error("agent-turn: taking back a fact failed:", undoError);
          return { error: "One of the things the fact is about was not found in this campaign, so nothing was filed. Check the ids." };
        }
      }
      return { id: factId };
    },

    // By name or by disguise, whichever the party knows them under. `%`, `_` and `\` are escaped: the text came
    // out of a model's tool call and must match as written, not as a pattern.
    async findCharacters(campaignId, name) {
      const pattern = `%${escapeLike(name)}%`;
      const columns = "id, name, disguise_name, is_revealed";
      const [byName, byDisguise] = await Promise.all([
        supabase.from("npcs").select(columns).eq("campaign_id", campaignId).ilike("name", pattern).limit(10),
        supabase.from("npcs").select(columns).eq("campaign_id", campaignId).ilike("disguise_name", pattern).limit(10),
      ]);
      if (byName.error) throw byName.error;
      if (byDisguise.error) throw byDisguise.error;
      return foundCharacters(byName.data ?? [], byDisguise.data ?? []);
    },

    // Through the caller's own client, so the campaign's rules for an NPC's place apply to this write as to any other.
    async placeCharacters(campaignId, locationId, characterIds) {
      if (characterIds.length === 0) return;
      const { error } = await supabase
        .from("npcs")
        .update({ location_id: locationId })
        .eq("campaign_id", campaignId)
        .in("id", characterIds)
        .or(`location_id.is.null,location_id.neq.${locationId}`);
      if (error) throw error;
    },

    revealToCharacter: (input) => revealToCharacter(supabase, input),

    // Fights: the campaign's own encounters, read and written as the caller; the conversation's row as the server.
    loadFights: (campaignId, locationId, fightEncounterId, pursuitEncounterId) => loadFights(supabase, campaignId, locationId, fightEncounterId, pursuitEncounterId),
    finishFight: (campaignId, encounterId) => finishFight(admin, campaignId, encounterId),
    setPursuit: (sessionId, campaignId, encounterId) => setPursuit(admin, sessionId, campaignId, encounterId),
    // As the caller: what they may read and share is the database's to decide.
    loadHandouts: (campaignId, memberId) => loadHandouts(supabase, campaignId, memberId),
    loadPicture: (campaignId, what, id) => loadPicture(supabase, campaignId, what, id),
    giveHandout: (campaignId, handoutId, memberId) => giveHandout(supabase, campaignId, handoutId, memberId),
    // Through the caller's client: the DM's own RLS decides which places and roads there are to travel by.
    // Behind the screen, so its fairness is the server's: a uniform whole number from 1 to max.
    rollDie: (max) => secureDie(Math.max(1, Math.trunc(max))),
    async loadTravelMap(campaignId, gameSystem) {
      const [places, roads, placed, rations] = await Promise.all([
        supabase.from("locations").select("id, name, parent_id").eq("campaign_id", campaignId),
        supabase.from("location_roads").select("id, from_location_id, to_location_id, distance, unit, name, going, difficult, roll_table_id, roll_table:roll_tables(id, name, dice, entries)").eq("campaign_id", campaignId),
        // The roll tables placed on this campaign's places. A placement has no campaign of its own: its place has.
        supabase.from("location_placements").select("location_id, roll_table:roll_tables!inner(id, name, dice, entries), place:locations!inner(campaign_id)")
          .not("roll_table_id", "is", null).eq("place.campaign_id", campaignId),
        // Whether this campaign counts food (the optional rule "Rations on the Road"; off unless switched on).
        supabase.from("campaign_rules").select("enabled").eq("campaign_id", campaignId).eq("rule_key", "rations").maybeSingle(),
      ]);
      if (rations.error) throw rations.error;
      if (placed.error) throw placed.error;
      if (places.error) throw places.error;
      if (roads.error) throw roads.error;
      return travelMapFrom({ places: places.data ?? [], roads: roads.data ?? [], placed: placed.data ?? [], rations: rations.data, gameSystem });
    },
    layFightLoot: (campaignId, encounterId, placeId, held) => layFightLoot(admin, campaignId, encounterId, placeId, held),
    startFight: (ctx, plan) => startFight(supabase, admin, ctx, plan),
    setFight: (sessionId, campaignId, encounterId) => setFight(admin, sessionId, campaignId, encounterId),
    statlessFighters: (campaignId, plan) => statlessFighters(supabase, campaignId, plan),
    hands: makeHandsStore(admin),

    // The campaign filter is in the query: a member of another campaign is not found, and nothing is written.
    async setHitPoints(campaignId, memberId, hitPoints) {
      const { error } = await admin.from("party_members").update({ current_hp: hitPoints }).eq("id", memberId).eq("campaign_id", campaignId);
      if (error) throw error;
    },

    // One of the thing leaves the character's belongings: the row goes when it was the last. Found by name without
    // regard to case, since the narrator writes the name as it read it.
    async useUpBelonging(campaignId, characterId, thing) {
      const { data, error } = await admin
        .from("npc_inventory")
        .select("id, quantity")
        .eq("npc_id", characterId)
        .eq("campaign_id", campaignId)
        .ilike("name", escapeLike(thing))
        .gt("quantity", 0)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return false;
      const after = afterUse(data.quantity as number);
      const write = after.kind === "update"
        ? await admin.from("npc_inventory").update({ quantity: after.quantity }).eq("id", data.id as string)
        : await admin.from("npc_inventory").delete().eq("id", data.id as string);
      if (write.error) throw write.error;
      return true;
    },

    async isTableMadeCharacter(campaignId, characterId) {
      const { data, error } = await supabase.from("npcs").select("ai_provenance").eq("id", characterId).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      return isUntouchedTableCharacter(data?.ai_provenance);
    },
    // A person the narrator made up, written as the caller: the DM's own RLS and their plan's limit on characters
    // decide, exactly as when they add someone by hand. What is true of them goes into the backstory, which a
    // player never reads; the player's character is shown the person only when it knows of them.
    async introduceCharacter(ctx, intro) {
      const provenance: AiProvenance = {
        generatorType: "agent_turn_character",
        provider: ctx.provider,
        model: ctx.model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };
      if (intro.replaces !== null) {
        // Only a record the table made and nobody has edited: the filter is in the write itself.
        const updated = await supabase
          .from("npcs")
          .update(characterRewrite(intro, provenance))
          .eq("id", intro.replaces)
          .eq("campaign_id", ctx.campaignId)
          .eq("ai_provenance->>generatorType", "agent_turn_character")
          .eq("ai_provenance->>edited", "false")
          .select("id, name")
          .maybeSingle();
        if (updated.error || !updated.data) throw updated.error ?? new Error("the record is no longer the table's to rewrite");
        return { id: updated.data.id as string, name: updated.data.name as string };
      }
      const { data, error } = await supabase
        .from("npcs")
        .insert(characterInsert(ctx, intro, provenance))
        .select("id, name")
        .single();
      if (error || !data) throw error ?? new Error("the record was not written");
      return { id: data.id as string, name: data.name as string };
    },
    // The campaign's own species, by name, read as the caller.
    async loadPeoples(campaignId) {
      const { data, error } = await supabase.from("species").select("name").eq("campaign_id", campaignId).order("name", { ascending: true }).limit(MAX_PEOPLES);
      if (error) throw error;
      return (data ?? []).map((r) => r.name as string);
    },

    // Where the campaign's story begins. Read as the caller (the DM's own rows); "has the story begun" is asked of
    // the server's own tables with the admin client, by campaign.
    async loadPrologue(campaignId): Promise<Prologue | null> {
      const camp = await supabase.from("campaigns").select("opening_quest_id").eq("id", campaignId).maybeSingle();
      if (camp.error) throw camp.error;
      const questId = (camp.data?.opening_quest_id as string | null | undefined) ?? null;
      if (questId === null) return null;
      // Named in the campaign: the column is not a foreign key, so a quest that is gone, or another campaign's, is none.
      const quest = await supabase.from("quests").select("id, entry_beat_id").eq("id", questId).eq("campaign_id", campaignId).maybeSingle();
      if (quest.error) throw quest.error;
      const beatId = (quest.data?.entry_beat_id as string | null | undefined) ?? null;
      if (beatId === null) return null;
      const beat = await supabase.from("quest_beats").select("id, title, staged_at_location_id, read_aloud").eq("id", beatId).eq("campaign_id", campaignId).maybeSingle();
      if (beat.error) throw beat.error;
      if (!beat.data) return null;
      // Begun means a turn was kept at the table in this campaign, by anyone: an empty conversation left by a
      // failed first turn does not count.
      const played = await admin
        .from("agent_turns")
        .select("id, agent_sessions!inner(campaign_id)", { count: "exact", head: true })
        .eq("agent_sessions.campaign_id", campaignId);
      if (played.error) throw played.error;
      return prologueFrom(questId, beatId, beat.data, played.count ?? 0);
    },

    async beginPrologue(campaignId, prologue): Promise<void> {
      const threads = await supabase.from("quest_threads").select("id", { count: "exact", head: true }).eq("quest_id", prologue.questId).eq("campaign_id", campaignId);
      if (threads.error) throw threads.error;
      if ((threads.count ?? 0) > 0) return;
      // The same function the quest screen calls, as the caller: it checks they are the campaign's DM.
      const { error } = await supabase.rpc("open_quest_thread", {
        p_campaign_id: campaignId,
        p_quest_id: prologue.questId,
        p_beat_id: prologue.beatId,
        p_label: "Main",
        p_reason: "The campaign begins",
      });
      if (error) throw error;
    },

    async discardFacts(campaignId, ids) {
      if (ids.length === 0) return;
      const { error } = await supabase.from("story_facts").delete().eq("campaign_id", campaignId).in("id", ids);
      if (error) throw error;
    },

    // Quests: read and written as the caller (the quest functions check the DM); the conversation's own row as the server.
    loadQuests: (campaignId, pressureClockId) => loadQuests(supabase, campaignId, pressureClockId),
    applyQuestMove: (ctx, move) => applyQuestMove(supabase, admin, ctx, move),

    // The canon (#1226 story 9): read as the caller (DM-only tables); the nearest-entries function and the world
    // block as the server, for the one campaign the handler has already checked.
    canon: canonStore({
      supabase,
      admin,
      embedQuery: async (query) => {
        const keys = await fetchPlatformKeys(admin, ["openai", "gemini"]);
        let provider;
        try {
          provider = await resolveEmbeddingProvider(admin, { openai: keys.openai ?? null, gemini: keys.gemini ?? null });
        } catch (error) {
          if (error instanceof EmbeddingProviderConfigError) {
            console.error("agent-turn: the canon lookup has no embedding provider:", error.message);
            return null;
          }
          throw error;
        }
        const { vectors, usage } = await provider.embed([query]);
        // The embedding is paid for by the platform and counted like the table's other reads.
        await recordFreeGeneration(admin, user.id, "agent_turn", { model: provider.model, provider: usage.provider, input_tokens: usage.input_tokens });
        return { vector: vectors[0], model: provider.model };
      },
    }),
    // The same judge as the narration check, with a tighter wait: a refusal is read inside a tool call.
    judgeCanon: await narrationJudgeFor({
      getKey: async () => (await fetchPlatformKeys(admin, ["typesafe"])).typesafe,
      record: (log) => recordFreeGeneration(admin, user.id, "entity_judgment", log),
      signal: req.signal,
      timeoutMs: CANON_JUDGE_TIMEOUT_MS,
    }),

    // Holds back narration that only repeats the characters' lines; null (everything shown) without a judging key.
    judgeNarration: await narrationJudgeFor({
      getKey: async () => (await fetchPlatformKeys(admin, ["typesafe"])).typesafe,
      record: (log) => recordFreeGeneration(admin, user.id, "entity_judgment", log),
      signal: req.signal,
    }),

    // The same switch `table-voice` answers to: without it no line is given a key.
    voiceKey:
      voicesOn(speechEnvFrom((key) => Deno.env.get(key)))
        ? (sessionId, line) => lineKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, sessionId, line)
        : null,

    tools: agentToolsFrom(listTools(), SOLO_TABLE_TOOLS, TABLE_REFUSED_TYPES),
    // Bound per call, because the campaign is only known once the handler has loaded and checked it. Every tool call
    // is pinned to that campaign: the caller's own access covers all the campaigns they run, and a conversation in
    // one of them must not be talked into reading another.
    callTool: (name, input) => {
      if (pinnedCampaignId === null) return Promise.resolve({ content: "The table has no campaign.", isError: true });
      return bindTools((n, args) => callTool(ctx, n, args), SOLO_TABLE_TOOLS, undefined, { campaign_id: pinnedCampaignId }, { refused: TABLE_REFUSED_TYPES, allTypes: ENTITY_TYPES })(name, input);
    },
  };

  const begun = await beginTurn({ userId: user.id, body, deps });
  if (begun.kind === "refused") return json(begun.refusal.status, { error: begun.refusal.error });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await begun.run(send, req.signal);
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by the client going away
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}));
