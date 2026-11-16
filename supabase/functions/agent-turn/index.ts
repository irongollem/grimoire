// agent-turn (#1205): runs one turn of a conversation with the AI table and streams it.
//
// The rules are `handler.ts`'s; this file wires the database, the provider and the MCP tools to them. The gates
// run before the stream opens so a refusal is a real status code; the turn itself runs inside the stream.
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
import { openaiModel } from "../_shared/agent/openai.ts";
import { anthropicModel } from "../_shared/agent/anthropic.ts";
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

const SESSION_COLUMNS = "id, user_id, campaign_id, summary, summary_through_seq, credits_spent";

function sessionRow(row: Record<string, unknown>): SessionRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    campaign_id: row.campaign_id as string,
    summary: (row.summary as string | null) ?? null,
    summary_through_seq: Number(row.summary_through_seq),
    // numeric may come back as a string
    credits_spent: Number(row.credits_spent),
  };
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
        .select("id, user_id, name, ai_enabled, game_system, text_provider, openai_api_key, anthropic_api_key, gemini_api_key")
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

    async createSession({ userId, campaignId, provider, model }): Promise<SessionRow> {
      const { data, error } = await admin
        .from("agent_sessions")
        .insert({ user_id: userId, campaign_id: campaignId, kind: "solo_table", provider, model })
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
      const { error } = await admin.rpc("append_agent_turns", {
        p_session_id: sessionId,
        p_after_seq: afterSeq,
        p_rows: rows,
        p_credits: credits,
      });
      if (!error) return "saved";
      if (error.code === "40001") return "conflict";
      throw error;
    },

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
