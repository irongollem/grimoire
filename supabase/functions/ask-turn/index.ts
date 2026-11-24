// ask-turn (#1253): runs one turn of a conversation with Ask Grimoire and streams it.
//
// The rules are `handler.ts`'s; this file wires the database, the provider, the MCP readers and the search to them.
// The gates run before the stream opens so a refusal is a real status code; the turn itself runs inside the stream.
// The conversation shell (gates, saving, the stream) is `_shared/agent/conversation/`, shared with `agent-turn`.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { retrieveCampaignHits } from "../_shared/campaignRetrieval.ts";
import { recordFreeGeneration, type CreditLogFields } from "../_shared/credits.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { judge, JEV_MODEL, judgingKey } from "../_shared/typesafe.ts";
import { ASK_SCOPE_TIMEOUT_MS } from "../_shared/agent/askScope.ts";
import { EmbeddingProviderConfigError, resolveEmbeddingProvider, toVectorLiteral } from "../_shared/embeddings.ts";
import { screenChatText } from "../_shared/moderation.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { callTool, listTools } from "../_shared/mcp/tools.ts";
import type { ToolContext } from "../_shared/mcp/tools.ts";
import { jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { settleHandedOff, withCreditHold, type JobLedger } from "../_shared/pipeline/creditHold.ts";
import { agentToolsFrom, ASK_TOOLS, bindTools } from "../_shared/agent/mcpTools.ts";
import { loadAgentCalibration, loadModelPrice, resolveAgentProvider } from "../_shared/agent/providerIo.ts";
import { loadTurnsInReach } from "../_shared/agent/turnsInReach.ts";
import { appendAgentTurns, saveAgentSummary } from "../_shared/agent/conversation/turnStore.ts";
import { insertAgentSession } from "../_shared/agent/conversation/session.ts";
import { eventStreamResponse, refusalResponse } from "../_shared/agent/conversation/stream.ts";
import { FREE_ASKS_PER_DAY, type AskEvent, type AskRecordType } from "../_shared/agent/askContract.ts";
import type { AskCampaignRow, AskFound, AskSessionRow, AskTurnDeps } from "../_shared/agent/askTypes.ts";
import type { CampaignSearchKind } from "../_shared/campaignSearch.ts";
import { readRulesFrom } from "../_shared/agent/askRulesRead.ts";
import { beginAsk, holdAsk } from "./handler.ts";
import { ASK_RECORD_TABLES, askRecordScope } from "./recordTables.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const SESSION_COLUMNS = "id, user_id, campaign_id, kind, summary, summary_through_seq";

function sessionOf(row: Record<string, unknown>): AskSessionRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    campaign_id: row.campaign_id as string,
    kind: row.kind as string,
    summary: (row.summary as string | null) ?? null,
    summary_through_seq: Number(row.summary_through_seq),
  };
}

/** The kinds `find` returns, as the record kinds Ask names. The library's copies are the same kind of thing as the DM's own. */
const FOUND_TYPE: Record<CampaignSearchKind, AskRecordType> = {
  npc: "npc", location: "location", faction: "faction", note: "note", quest: "quest", canon: "canon",
  item: "item", library_item: "item", monster: "monster", library_monster: "monster",
};

serve(serveUser(async ({ user, req, report, userClient: supabase }) => {
  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", "The request is not valid.");

  // The readers run as the caller, through their own RLS client, exactly as the MCP server runs them. Ask never
  // rolls, so the service client is never needed (`ASK_TOOLS` holds no tool that asks for it).
  const ctx: ToolContext = {
    supabase,
    userId: user.id,
    email: user.email,
    serviceClient: () => {
      throw new Error("Ask Grimoire has no tool that needs the service client.");
    },
  };

  let moderationKey: string | null = null;
  let rawCampaign: Record<string, unknown> | null = null;

  // The running turn's ledger, for the free line `find`'s embedding writes (platform-paid). Set while the stream's run
  // is settling; outside it the line is written directly.
  let runLedger: JobLedger | null = null;
  const freeLine = (reason: string, log: CreditLogFields): Promise<void> => {
    if (runLedger !== null) {
      runLedger.free(reason, log);
      return Promise.resolve();
    }
    return recordFreeGeneration(admin, user.id, reason, log);
  };

  const deps: AskTurnDeps = {
    async accountRefusal(userId) {
      // Fail closed: a conversation with a model is not something to allow on a lookup that could not be made.
      const refusal = await generationRefusal(admin, userId, { failClosed: true });
      if (!refusal) return null;
      const detail = await refusal.json().catch(() => ({}));
      return { status: refusal.status, error: typeof detail?.error === "string" ? detail.error : "refused" };
    },

    async loadCampaign(campaignId): Promise<AskCampaignRow | null> {
      const { data, error } = await admin
        .from("campaigns")
        .select("id, user_id, name, ai_enabled, game_system")
        .eq("id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      rawCampaign = data;
      return {
        id: data.id,
        user_id: data.user_id,
        name: data.name,
        game_system: data.game_system,
        // Not plan-gated: Ask is open to every plan and bills its answers. Only the campaign's own switch applies.
        ai_enabled: data.ai_enabled === true,
      };
    },

    isDm: (campaign, userId) => isCampaignDm(admin, campaign, userId),

    async loadSession(sessionId) {
      const { data, error } = await admin.from("agent_sessions").select(SESSION_COLUMNS).eq("id", sessionId).maybeSingle();
      if (error) throw error;
      return data ? sessionOf(data) : null;
    },

    rateLimit: (userId) => checkRateLimit(admin, userId, "ask_turn"),

    async resolveProvider() {
      if (!rawCampaign) return null;
      const resolved = await resolveAgentProvider(admin);
      if (resolved === null) return null;
      moderationKey = resolved.moderationKey;
      return resolved.provider;
    },

    loadPrice: (model) => loadModelPrice(admin, model),
    loadCalibration: () => loadAgentCalibration(admin),

    async isFlagged(message) {
      const verdict = await screenChatText(message, { apiKey: moderationKey, admin, userId: user.id, surface: "ask_turn" });
      return verdict?.flagged === true;
    },

    async judgeScope(request) {
      // Only a platform key judges: the DM's words go to a third party. The campaign's AI switch is already on here.
      const key = judgingKey(true, (await fetchPlatformKeys(admin, ["typesafe"])).typesafe);
      if (key === null) return null;
      const result = await judge(request, { apiKey: key, timeoutMs: ASK_SCOPE_TIMEOUT_MS });
      // Platform-paid, like the narration and rerank checks: the tokens were spent whatever the verdict. A failure to
      // log costs a ledger row, never the judgement.
      try {
        await freeLine("entity_judgment", { model: JEV_MODEL, provider: "typesafe", input_tokens: result.inputTokens });
      } catch (error) {
        console.error("ask-turn: logging the scope check failed:", error);
      }
      return result;
    },

    async settleRoutes(userId) {
      const { data, error } = await admin.rpc("settle_ask_routes", { p_user_id: userId, p_free_per_day: FREE_ASKS_PER_DAY });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row.credits !== "number" || typeof row.free_left !== "number") throw new Error("settle_ask_routes answered nothing");
      return { credits: row.credits, freeLeft: row.free_left };
    },

    async recordRoute(userId, route) {
      const { error } = await admin.from("ask_pending_routes").insert({
        proposal_id: route.proposalId,
        user_id: userId,
        session_id: route.sessionId,
        credits: route.credits,
      });
      if (error) throw error;
    },

    async createSession({ userId, campaignId, provider, model }) {
      return sessionOf(await insertAgentSession(admin, { kind: "ask", userId, campaignId, provider, model, columns: SESSION_COLUMNS }));
    },

    loadTurns: (sessionId, summaryThroughSeq) => loadTurnsInReach(admin, sessionId, summaryThroughSeq),

    withHold: (userId, credits, work) => withCreditHold(admin, { payerId: userId, reason: "ask_answer", cost: credits, report }, work),
    settle: (userId, ids, work) =>
      settleHandedOff(admin, { payerId: userId, ids, report }, async (ledger) => {
        runLedger = ledger;
        try {
          return await work(ledger);
        } finally {
          runLedger = null;
        }
      }),

    appendTurns: (sessionId, afterSeq, rows, credits) => appendAgentTurns(admin, sessionId, afterSeq, rows, credits),
    saveSummary: (input) => saveAgentSummary(admin, input),

    async chargeAnswer(userId, credits) {
      const { data, error } = await admin.rpc("charge_ask_answer", { p_user_id: userId, p_credits: credits, p_free_per_day: FREE_ASKS_PER_DAY });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row.free !== "boolean") throw new Error("charge_ask_answer answered nothing");
      return { free: row.free, credits: Number(row.credits), freeLeft: Number(row.free_left) };
    },

    mcpTools: agentToolsFrom(listTools(), ASK_TOOLS),
    // Bound per campaign, because the campaign is only known once the handler has loaded and checked it. Every read is
    // pinned to it: the caller's own access covers all the campaigns they run, and a conversation in one of them
    // must not be talked into reading another.
    callMcp: (campaignId) => bindTools((name, args) => callTool(ctx, name, args), ASK_TOOLS, undefined, { campaign_id: campaignId }),

    async find(campaign, query): Promise<AskFound[] | null> {
      let provider;
      try {
        const keys = await fetchPlatformKeys(admin, ["openai", "gemini"]);
        provider = await resolveEmbeddingProvider(admin, { openai: keys.openai ?? null, gemini: keys.gemini ?? null });
      } catch (error) {
        if (error instanceof EmbeddingProviderConfigError) {
          console.error("ask-turn: find has no embedding provider:", error.message);
          return null;
        }
        throw error;
      }
      // Before the embed, so a limited caller costs nothing.
      if (!(await checkRateLimit(admin, user.id, "campaign_search"))) return null;
      const { vectors, usage } = await provider.embed([query]);
      await freeLine("campaign_search", { model: provider.model, provider: usage.provider, input_tokens: usage.input_tokens });
      const retrieved = await retrieveCampaignHits(admin, {
        campaignId: campaign.id,
        ownerId: campaign.user_id,
        gameSystem: campaign.game_system,
        vector: toVectorLiteral(vectors[0]),
        model: provider.model,
      });
      if (retrieved.allFailed) return null;
      return retrieved.ranked.map((h) => ({ type: FOUND_TYPE[h.kind], id: h.id, name: h.name, descriptor: h.descriptor }));
    },

    // As the caller: what they may read is the database's to decide. The campaign filter is in the query, so an id
    // from another campaign (or no row at all) is "not found" either way.
    async loadRecord(campaign, type, id) {
      const source = ASK_RECORD_TABLES[type];
      const { data, error } = await supabase
        .from(source.table)
        .select(`id, ${source.nameColumn}`)
        .eq("id", id)
        .or(askRecordScope(type, campaign, user.id))
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const name = (data as unknown as Record<string, unknown>)[source.nameColumn];
      return typeof name === "string" && name.trim() !== "" ? { name: name.trim() } : null;
    },

    // As the caller, like `loadRecord`: the edition and the enabled sources are filtered in the queries themselves.
    readRules: (campaign, query, kind) => readRulesFrom(supabase, { campaignId: campaign.id, gameSystem: campaign.game_system, query, kind }),

    newId: () => crypto.randomUUID(),

    // The service role, and on purpose with no user, campaign or session in the call: the ledger is anonymous.
    async recordManualGap(question, pages) {
      const { error } = await admin.rpc("record_manual_gap", { p_question: question, p_pages: pages });
      if (error) throw error;
    },
  };

  const begun = await beginAsk({ userId: user.id, body, deps });
  if (begun.kind === "refused") return refusalResponse(begun.refusal);
  return holdAsk(deps, user.id, begun, (ids) => eventStreamResponse<AskEvent>((send) => begun.run(send, req.signal, ids)));
}));
