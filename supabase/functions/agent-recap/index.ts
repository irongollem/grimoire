// agent-recap (#1021 row 19): a sitting at the AI table told as a story, into the note it left. The rules are
// `handler.ts`'s; this file wires the database and the model, with the same provider, price and calibration lookups
// a turn of the table uses (`_shared/agent/providerIo.ts`).
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { generationRefusal } from "../_shared/accountGate.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { loadAgentCalibration, loadModelPrice, resolveAgentProvider } from "../_shared/agent/providerIo.ts";
import { loadSittingFacts } from "../_shared/agent/sittingFacts.ts";
import { loadTurnsInReach } from "../_shared/agent/turnsInReach.ts";
import { tellSitting, type RecapCampaign, type RecapDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(serveUser(async ({ user, req, report }) => {
  // The same account gate every generator stands behind (a suspended or child account makes nothing).
  // Fail closed, as a turn of the table does: a model is not called on an account a lookup could not clear.
  const gate = await generationRefusal(admin, user.id, { failClosed: true });
  if (gate) return gate;

  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", "The request is not valid.");

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

    // The DM only, and a caller who is not is told the note does not exist: a 403 would say it does.
    loadCampaign: (campaignId, userId) =>
      loadAiCampaign<RecapCampaign>(admin, campaignId, userId, { aiSwitch: "table", hideFromOutsiders: true }),

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

    loadFacts: (sittingId) => loadSittingFacts(admin, sittingId),

    async characterName(campaignId, characterId) {
      const { data, error } = await admin.from("party_members").select("name").eq("id", characterId).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      return data ? (data.name as string) : null;
    },

    async resolveProvider() {
      const resolved = await resolveAgentProvider(admin);
      return resolved === null ? null : resolved.provider;
    },

    loadPrice: (model) => loadModelPrice(admin, model),
    loadCalibration: () => loadAgentCalibration(admin),

    withHold: (credits, work) => withCreditHold(admin, { payerId: user.id, reason: "agent_recap", cost: credits, report }, work),

    // As the service role: the note is the DM's (the handler has checked), and the telling is the table's own text.
    async writeNote(noteId, content) {
      const { error } = await admin.from("notes").update({ content }).eq("id", noteId);
      if (error) throw error;
    },

  };

  return tellSitting({ userId: user.id, body, deps });
}));
