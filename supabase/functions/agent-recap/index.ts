// agent-recap (#1021 row 19): a sitting at the AI table told as a story, into the note it left. The rules are
// `handler.ts`'s; this file wires the database and the model, with the same provider, price and calibration lookups
// a turn of the table uses (`_shared/agent/providerIo.ts`).
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { tableAiEnabled } from "../_shared/featureAccess.ts";
import { withCors } from "../_shared/cors.ts";
import { generationRefusal } from "../_shared/accountGate.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { recordFreeGeneration, recordGeneration, releaseCredits, reserveCredits } from "../_shared/credits.ts";
import { loadAgentCalibration, loadModelPrice, resolveAgentProvider } from "../_shared/agent/providerIo.ts";
import { loadTurnsInReach } from "../_shared/agent/turnsInReach.ts";
import { tellSitting, type RecapDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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

  // The same account gate every generator stands behind (a suspended or child account makes nothing).
  // Fail closed, as a turn of the table does: a model is not called on an account a lookup could not clear.
  const gate = await generationRefusal(admin, user.id, { failClosed: true });
  if (gate) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  // The campaign row with its key columns, kept from `loadCampaign` for the provider lookup.
  let rawCampaign: Record<string, unknown> | null = null;

  const deps: RecapDeps = {
    async loadNote(noteId) {
      const { data, error } = await admin.from("notes").select("id, campaign_id, ai_provenance").eq("id", noteId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const mark = (typeof data.ai_provenance === "object" && data.ai_provenance !== null ? data.ai_provenance : {}) as Record<string, unknown>;
      return {
        id: data.id as string,
        campaign_id: (data.campaign_id as string | null) ?? null,
        generatorType: typeof mark.generatorType === "string" ? mark.generatorType : null,
        edited: mark.edited === true,
      };
    },

    async loadCampaign(campaignId) {
      const { data, error } = await admin
        .from("campaigns")
        .select("id, user_id, ai_enabled, text_provider, openai_api_key, anthropic_api_key, gemini_api_key")
        .eq("id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      rawCampaign = data;
      return { id: data.id as string, user_id: data.user_id as string, ai_enabled: await tableAiEnabled(admin, data) };
    },

    isDm: (campaign, userId) => isCampaignDm(admin, campaign, userId),

    async loadSitting(noteId, userId) {
      const { data, error } = await admin
        .from("agent_sessions")
        .select("id, summary, summary_through_seq, party_member_id")
        .eq("note_id", noteId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { id: data.id as string, summary: (data.summary as string | null) ?? null, summary_through_seq: Number(data.summary_through_seq), party_member_id: (data.party_member_id as string | null) ?? null }
        : null;
    },

    loadTurns: (sittingId, through) => loadTurnsInReach(admin, sittingId, through),

    async loadFacts(sittingId) {
      const { data, error } = await admin.from("story_facts").select("body, known_to_player").eq("agent_session_id", sittingId).order("created_at", { ascending: true }).order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({ body: row.body as string, known_to_player: row.known_to_player === true }));
    },

    async characterName(campaignId, characterId) {
      const { data, error } = await admin.from("party_members").select("name").eq("id", characterId).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      return data ? (data.name as string) : null;
    },

    async resolveProvider(campaign) {
      if (!rawCampaign) return null;
      const resolved = await resolveAgentProvider(admin, { ownerId: campaign.user_id, raw: rawCampaign });
      return resolved === null ? null : resolved.provider;
    },

    loadPrice: (model) => loadModelPrice(admin, model),
    loadCalibration: () => loadAgentCalibration(admin),

    async reserve(userId, credits) {
      const reservation = await reserveCredits(admin, userId, credits, "agent_recap");
      if (reservation.ok) return { ok: true, ids: reservation.ids };
      if (reservation.suspended) return { ok: false, status: 403, error: "account_suspended" };
      if (reservation.child_account) return { ok: false, status: 403, error: "child_account" };
      if (reservation.velocity) return { ok: false, status: 429, error: "rate_limited" };
      if (reservation.insufficient) return { ok: false, status: 402, error: "insufficient_credits" };
      return { ok: false, status: 503, error: "The telling cannot be metered right now." };
    },

    release: (ids) => releaseCredits(admin, ids),

    // As the service role: the note is the DM's (the handler has checked), and the telling is the table's own text.
    async writeNote(noteId, content) {
      const { error } = await admin.from("notes").update({ content }).eq("id", noteId);
      if (error) throw error;
    },

    charge: (userId, isByok, credits, log) => recordGeneration(admin, userId, "agent_recap", isByok, credits, log),
    logUncharged: (userId, isByok, log) => (isByok ? recordGeneration(admin, userId, "agent_recap", true, 0, log) : recordFreeGeneration(admin, userId, "agent_recap", log)),
  };

  try {
    const outcome = await tellSitting({ userId: user.id, body, deps });
    if (!outcome.ok) return json(outcome.status, { error: outcome.error });
    return json(200, { told: true, credits: outcome.credits });
  } catch (error) {
    console.error("agent-recap failed:", error);
    return json(500, { error: "The sitting could not be told right now. Nothing was charged." });
  }
}));
