// agent-turn (#1205): runs one turn of a conversation with the AI table and streams it.
//
// The rules are `handler.ts`'s; this file wires the database, the provider and the MCP tools to them. The gates
// run before the stream opens so a refusal is a real status code; the turn itself runs inside the stream.
import { giveHandout, loadHandouts, loadPicture } from "./showIo.ts";
import type { Road } from "../../../src/lib/travel/roads.ts";
import { CHILD_TURN_THRESHOLDS, readsAsChild, STRIKE_WINDOW_DAYS } from "../_shared/agent/conduct.ts";
import { belongingsText, MAX_BELONGINGS, type Belonging } from "../_shared/agent/belongings.ts";
import { MAX_PEOPLES } from "../_shared/agent/peoples.ts";
import { lineKey } from "../_shared/agent/lineKey.ts";
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { decryptValue } from "../_shared/vault.ts";
import { isUserPro } from "../_shared/plan.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { fetchProviderConfigs } from "../_shared/provider-config.ts";
import { DEFAULT_TEXT_MODELS, resolveTextProvider } from "../_shared/textGen.ts";
import {
  recordFreeGeneration,
  recordGeneration,
  releaseCredits,
  reserveCredits,
  type CreditLogFields,
} from "../_shared/credits.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { isPromptRejected, screenImagePrompt } from "../_shared/moderation.ts";
import { callTool, listTools } from "../_shared/mcp/tools.ts";
import type { ToolContext } from "../_shared/mcp/tools.ts";
import { agentToolsFrom, bindTools, SOLO_TABLE_TOOLS } from "../_shared/agent/mcpTools.ts";
import { buildNpcProfile, NPC_PROFILE_COLUMNS, shownNpcName, type NpcProfileRow } from "../_shared/npcProfile.ts";
import { campaignToday } from "../_shared/npcAge.ts";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { BESIDE_MAX, PLACES_MAX, CHARACTERS_MAX, type SceneView } from "../_shared/agent/scene.ts";
import { formatNpcMemories, loadPromptMemories } from "../_shared/npcMemories.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { loadPartyMember } from "./characterIo.ts";
import { RECORD_SECTION_MAX, type RecordedFact } from "../_shared/agent/record.ts";
import { openaiModel } from "../_shared/agent/openai.ts";
import { revealToCharacter } from "./revealIo.ts";
import { makeHandsStore } from "./handsIo.ts";
import { finishFight, layFightLoot, loadFights, setFight, setPursuit, startFight, statlessFighters } from "./fightIo.ts";
import type { Prologue } from "../_shared/agent/prologue.ts";
import { parsePendingRoll } from "../_shared/agent/playerRoll.ts";
import { anthropicModel } from "../_shared/agent/anthropic.ts";
import { applyQuestMove, loadQuests } from "./questIo.ts";
import { narrationJudgeFor } from "./narrationJudge.ts";
import type { CallModel } from "../_shared/agent/types.ts";
import type { StoredTurn, TurnRow } from "../_shared/agent/transcript.ts";
import {
  beginTurn,
  type AgentEvent,
  type AgentTurnDeps,
  type CampaignRow,
  type Refusal,
  type ResolvedProvider,
  type SessionRow,
} from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SESSION_COLUMNS = "id, user_id, campaign_id, summary, summary_through_seq, scene_location_id, campaign_session_id, pressure_clock_id, party_member_id, opened_play_session, left_at, pending_roll, fight_encounter_id, pursuit_encounter_id";

/** Beside what is tied to this place and these people, the campaign's newest facts always reach the narrator. */
const NEWEST_FACTS = 15;

function sessionRow(row: Record<string, unknown>): SessionRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    campaign_id: row.campaign_id as string,
    summary: (row.summary as string | null) ?? null,
    summary_through_seq: Number(row.summary_through_seq),
    scene_location_id: (row.scene_location_id as string | null) ?? null,
    campaign_session_id: (row.campaign_session_id as string | null) ?? null,
    pressure_clock_id: (row.pressure_clock_id as string | null) ?? null,
    party_member_id: (row.party_member_id as string | null) ?? null,
    opened_play_session: row.opened_play_session === true,
    left_at: (row.left_at as string | null) ?? null,
    // Anything this code did not write reads as nothing asked: a roll is never scored against a DC it cannot trust.
    pending_roll: parsePendingRoll(row.pending_roll),
    fight_encounter_id: (row.fight_encounter_id as string | null) ?? null,
    pursuit_encounter_id: (row.pursuit_encounter_id as string | null) ?? null,
  };
}

// The database answers with the whole credits to bill. A value that is not a number must never become "bill nothing".
function wholeCredits(data: unknown): number {
  const due = Number(data);
  if (data === null || data === undefined || !Number.isFinite(due)) throw new Error("the database did not say what is due");
  return due;
}

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
        .select("id, user_id, name, ai_enabled, game_system, text_provider, current_year, current_month, current_day, openai_api_key, anthropic_api_key, gemini_api_key")
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
        ai_enabled: data.ai_enabled,
      };
    },

    isDm: (campaign, userId) => isCampaignDm(admin, campaign, userId),

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
      const next = last && typeof last.number === "number" ? last.number + 1 : 1;
      const { data, error } = await supabase.rpc("start_campaign_session", { p_campaign_id: campaignId, p_number: next });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row && typeof row.id === "string" ? { id: row.id, opened: (running ?? []).length === 0 } : null;
    },

    async createSession({ userId, campaignId, provider, model, sceneLocationId, campaignSessionId, openedPlaySession, partyMemberId }): Promise<SessionRow> {
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
        })
        .select(SESSION_COLUMNS)
        .single();
      if (error) throw error;
      return sessionRow(data);
    },

    async loadTurns(sessionId): Promise<StoredTurn[]> {
      const { data, error } = await admin
        .from("agent_turns")
        .select("seq, role, blocks")
        .eq("session_id", sessionId)
        .order("seq", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StoredTurn[];
    },

    rateLimit: (userId) => checkRateLimit(admin, userId, "agent_turn"),

    async resolveProvider(campaign): Promise<ResolvedProvider | null> {
      const raw = rawCampaign;
      if (!raw) return null;
      // BYOK is Pro-only: ignore stored campaign keys unless the owner is currently Pro.
      const ownerIsPro = await isUserPro(admin, campaign.user_id);
      const decryptKey = async (enc: unknown): Promise<string | null> => {
        if (typeof enc !== "string" || !enc || !ownerIsPro) return null;
        try { return await decryptValue(enc); } catch { return null; }
      };
      const [campaignOpenai, campaignAnthropic, campaignGemini] = await Promise.all([
        decryptKey(raw.openai_api_key),
        decryptKey(raw.anthropic_api_key),
        decryptKey(raw.gemini_api_key),
      ]);
      const [platformKeys, providerConfigs] = await Promise.all([
        fetchPlatformKeys(admin, ["openai", "anthropic", "gemini"]),
        fetchProviderConfigs(admin, ["openai", "anthropic", "gemini"]),
      ]);
      const text = resolveTextProvider({
        chosen: raw.text_provider as string | null,
        campaignKeys: { openai: campaignOpenai, anthropic: campaignAnthropic, gemini: campaignGemini },
        platformKeys,
        providerConfigs,
      });
      if (!text) return null;
      // The moderation endpoint is free; the platform's key is preferred so a campaign's own key is not used for it.
      moderationKey = platformKeys.openai ?? campaignOpenai ?? null;
      // text_model is the platform's pick; `?? default` is the one place a nullable column means "use the default".
      const model = text.config?.text_model ?? DEFAULT_TEXT_MODELS[text.provider];
      let callModel: CallModel | null = null;
      if (text.provider === "openai") callModel = openaiModel(text.apiKey, model);
      else if (text.provider === "anthropic") callModel = anthropicModel(text.apiKey, model);
      return { provider: text.provider, model, isByok: text.isByok, callModel };
    },

    async loadPrice(model) {
      const { data, error } = await admin
        .from("ai_model_pricing")
        .select("input_cost_per_million_tokens, output_cost_per_million_tokens, cached_input_cost_per_million_tokens")
        .eq("model", model)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const input = data.input_cost_per_million_tokens;
      const output = data.output_cost_per_million_tokens;
      if (input === null || output === null) return null;
      const cached = data.cached_input_cost_per_million_tokens;
      return {
        inputPerMillion: Number(input),
        outputPerMillion: Number(output),
        cachedInputPerMillion: cached === null ? null : Number(cached),
      };
    },

    async loadCalibration() {
      const { data, error } = await admin.rpc("agent_credit_calibration");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        usdPerCredit: row.usd_per_credit === null ? null : Number(row.usd_per_credit),
        margin: Number(row.margin),
      };
    },

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
      // Same mapping as reservationFailureResponse, as values.
      if (reservation.suspended) return { ok: false, refusal: { status: 403, error: "account_suspended" } };
      if (reservation.child_account) return { ok: false, refusal: { status: 403, error: "child_account" } };
      if (reservation.velocity) return { ok: false, refusal: { status: 429, error: "rate_limited" } };
      if (reservation.insufficient) return { ok: false, refusal: { status: 402, error: "insufficient_credits" } };
      return { ok: false, refusal: { status: 503, error: "The AI table cannot be metered right now." } };
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
      if (!data) return null;
      const npc = data as unknown as NpcProfileRow;
      const [memories, carried] = await Promise.all([
        loadPromptMemories(admin, npc.id, campaignId),
        admin.from("npc_inventory").select("name, quantity").eq("npc_id", npc.id).eq("campaign_id", campaignId).order("name").limit(MAX_BELONGINGS + 1),
      ]);
      if (carried.error) throw carried.error;
      const belongings = belongingsText((carried.data ?? []) as Belonging[]);
      const profile = buildNpcProfile(npc, campaignToday(rawCampaign));
      return {
        id: npc.id,
        shownName: shownNpcName(npc),
        profile: belongings === null ? profile : `${profile}\n\n${belongings}`,
        memories: formatNpcMemories(memories, npc),
      };
    },

    loadCharacter: (campaignId, characterId) => loadPartyMember(admin, campaignId, characterId),

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
      return {
        id: place.id as string,
        name: place.name as string,
        kind: (place.location_type as string | null) ?? null,
        description: toPlainText(place.description as string | null),
        within: parent.data ? (parent.data.name as string) : null,
        withinId: parent.data ? (place.parent_id as string) : null,
        beside: (siblings.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
        places: (children.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
        characters: (people.data ?? []).map((n) => {
          return {
            id: n.id as string,
            name: shownNpcName({
              name: n.name as string,
              disguise_name: n.disguise_name as string | null,
              is_revealed: n.is_revealed === true,
            }),
            occupation: (n.occupation as string | null) ?? null,
          };
        }),
      };
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
      const { data: known, error: readError } = await admin.from("npcs").select("id").in("id", ids).eq("campaign_id", campaignId);
      if (readError) throw readError;
      const inCampaign = new Set((known ?? []).map((n) => n.id as string));
      const provenance: AiProvenance = {
        generatorType: "agent_turn_memory",
        provider,
        model,
        generatedAt: new Date().toISOString(),
        edited: false,
      };
      const rows = memories
        .filter((m) => inCampaign.has(m.characterId))
        .map((m) => ({
          npc_id: m.characterId,
          campaign_id: campaignId,
          user_id: userId,
          kind: m.kind,
          body: m.body,
          session_id: campaignSessionId,
          ai_provenance: provenance,
        }));
      if (rows.length === 0) return;
      const { error } = await admin.from("npc_memories").insert(rows);
      if (error) throw error;
    },

    // The record. Read and written through the caller's own client, never the service role: the database refuses a
    // tie to a row of another campaign only when the writer is a signed-in user, and a model chose these ids.
    // Candidates are what is tied to this place or these people, plus the campaign's newest facts, so something
    // filed just now about somewhere else still reaches the narrator.
    async loadRecord(campaignId, about): Promise<RecordedFact[]> {
      const ties: string[] = [];
      if (about.locationId !== null) ties.push(`location_id.eq.${about.locationId}`);
      if (about.characterIds.length > 0) ties.push(`npc_id.in.(${about.characterIds.join(",")})`);
      const [linked, newest] = await Promise.all([
        ties.length === 0
          ? Promise.resolve({ data: [] as Array<{ fact_id: string }>, error: null })
          : supabase.from("story_fact_links").select("fact_id").eq("campaign_id", campaignId).or(ties.join(",")),
        supabase.from("story_facts").select("id").eq("campaign_id", campaignId)
          .order("created_at", { ascending: false }).limit(NEWEST_FACTS),
      ]);
      if (linked.error) throw linked.error;
      if (newest.error) throw newest.error;
      const ids = [...new Set([...(linked.data ?? []).map((l) => l.fact_id as string), ...(newest.data ?? []).map((f) => f.id as string)])];
      if (ids.length === 0) return [];

      const [facts, closers] = await Promise.all([
        supabase.from("story_facts").select("id, body, known_to_player, session_id, created_at")
          .eq("campaign_id", campaignId).in("id", ids),
        supabase.from("story_facts").select("supersedes_id").eq("campaign_id", campaignId).in("supersedes_id", ids),
      ]);
      if (facts.error) throw facts.error;
      if (closers.error) throw closers.error;
      const closed = new Set((closers.data ?? []).map((c) => c.supersedes_id as string));
      const open = (facts.data ?? []).filter((f) => !closed.has(f.id as string));

      const sessionIds = [...new Set(open.map((f) => f.session_id as string | null).filter((id): id is string => id !== null))];
      const numbers = new Map<string, number>();
      if (sessionIds.length > 0) {
        const { data, error } = await supabase.from("campaign_sessions").select("id, number")
          .eq("campaign_id", campaignId).in("id", sessionIds);
        if (error) throw error;
        for (const s of data ?? []) if (typeof s.number === "number") numbers.set(s.id as string, s.number);
      }

      return open
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .slice(-RECORD_SECTION_MAX)
        .map((f) => {
          const number = f.session_id === null ? undefined : numbers.get(f.session_id as string);
          return {
            id: f.id as string,
            body: f.body as string,
            hidden: f.known_to_player !== true,
            when: number === undefined ? null : `Session ${number}`,
          };
        });
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
        return { error: closes !== null && (error?.code === "23503" || error?.code === "23514")
          ? "The fact to close was not found on this campaign's record, so nothing was filed. Use an id listed under \"On record\"."
          : "The fact could not be put on record. Say what happens without filing it." };
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
      const pattern = `%${name.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const columns = "id, name, disguise_name, is_revealed";
      const [byName, byDisguise] = await Promise.all([
        supabase.from("npcs").select(columns).eq("campaign_id", campaignId).ilike("name", pattern).limit(10),
        supabase.from("npcs").select(columns).eq("campaign_id", campaignId).ilike("disguise_name", pattern).limit(10),
      ]);
      if (byName.error) throw byName.error;
      if (byDisguise.error) throw byDisguise.error;
      const seen = new Map<string, { id: string; shownName: string }>();
      for (const n of [...(byName.data ?? []), ...(byDisguise.data ?? [])]) {
        seen.set(n.id as string, {
          id: n.id as string,
          shownName: shownNpcName({
            name: n.name as string,
            disguise_name: n.disguise_name as string | null,
            is_revealed: n.is_revealed === true,
          }),
        });
      }
      return [...seen.values()];
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
    async loadTravelMap(campaignId) {
      const [places, roads] = await Promise.all([
        supabase.from("locations").select("id, name, parent_id").eq("campaign_id", campaignId),
        supabase.from("location_roads").select("id, from_location_id, to_location_id, distance, unit, name, going").eq("campaign_id", campaignId),
      ]);
      if (places.error) throw places.error;
      if (roads.error) throw roads.error;
      return {
        places: (places.data ?? []).map((p) => ({ id: p.id as string, name: p.name as string, parentId: p.parent_id as string | null })),
        // `distance` is numeric; anything that does not read as a number is not a road to travel by.
        roads: (roads.data ?? []).map((r) => ({ ...r, distance: Number(r.distance) }) as Road).filter((r) => Number.isFinite(r.distance)),
      };
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
        .ilike("name", thing.replace(/[%_\\]/g, "\\$&"))
        .gt("quantity", 0)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return false;
      const left = (data.quantity as number) - 1;
      const write = left > 0
        ? await admin.from("npc_inventory").update({ quantity: left }).eq("id", data.id as string)
        : await admin.from("npc_inventory").delete().eq("id", data.id as string);
      if (write.error) throw write.error;
      return true;
    },

    async isTableMadeCharacter(campaignId, characterId) {
      const { data, error } = await supabase.from("npcs").select("ai_provenance").eq("id", characterId).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      const p = data?.ai_provenance as { generatorType?: unknown; edited?: unknown } | null | undefined;
      return p?.generatorType === "agent_turn_character" && p.edited === false;
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
          .update({ backstory: intro.about, ...(intro.occupation === null ? {} : { occupation: intro.occupation }), ai_provenance: provenance })
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
        .insert({
          user_id: ctx.userId,
          campaign_id: ctx.campaignId,
          name: intro.name,
          occupation: intro.occupation,
          backstory: intro.about,
          location_id: intro.here ? ctx.locationId : null,
          player_visible_to: intro.known && ctx.memberId !== null ? [ctx.memberId] : [],
          ai_provenance: provenance,
        })
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
      if ((played.count ?? 0) > 0) return null;
      return {
        questId,
        beatId,
        beatTitle: (beat.data.title as string | null) ?? "",
        locationId: (beat.data.staged_at_location_id as string | null) ?? null,
        readAloud: toPlainText(beat.data.read_aloud as string | null),
      };
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

    // Holds back narration that only repeats the characters' lines; null (everything shown) without a judging key.
    judgeNarration: await narrationJudgeFor({
      getKey: async () => (await fetchPlatformKeys(admin, ["typesafe"])).typesafe,
      record: (log) => recordFreeGeneration(admin, user.id, "entity_judgment", log),
      signal: req.signal,
    }),

    // The same switch `table-voice` answers to: without it no line is given a key.
    voiceKey:
      Deno.env.get("ELEVENLABS_API_KEY") && Deno.env.get("TABLE_VOICE_TRIAL") === "on"
        ? (sessionId, line) => lineKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, sessionId, line)
        : null,

    tools: agentToolsFrom(listTools(), SOLO_TABLE_TOOLS),
    // Bound per call, because the campaign is only known once the handler has loaded and checked it. Every tool call
    // is pinned to that campaign: the caller's own access covers all the campaigns they run, and a conversation in
    // one of them must not be talked into reading another.
    callTool: (name, input) => {
      if (pinnedCampaignId === null) return Promise.resolve({ content: "The table has no campaign.", isError: true });
      return bindTools((n, args) => callTool(ctx, n, args), SOLO_TABLE_TOOLS, undefined, { campaign_id: pinnedCampaignId })(name, input);
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
