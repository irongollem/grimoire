// agent-forget (#1021): a sitting at the AI table is deleted, with the voice clips made for it. The rules are
// `handler.ts`'s; this file wires the database and the clips' store. The conversation is read and deleted with the
// service role (the handler has already checked it is the caller's own), because the clips must go before the row
// and a client can reach only the row.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { removeSittingClips, voiceStoreFrom } from "../_shared/agent/voiceClips.ts";
import { forgetSitting, type AgentForgetDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const voiceStore = voiceStoreFrom((key) => Deno.env.get(key));

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const deps: AgentForgetDeps = {
    async loadSession(sessionId) {
      const { data, error } = await admin.from("agent_sessions").select("id, user_id, campaign_id, left_at").eq("id", sessionId).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, user_id: data.user_id as string, campaign_id: data.campaign_id as string, left_at: (data.left_at as string | null) ?? null } : null;
    },

    async sessionIdsOf(campaignId, userId) {
      const { data, error } = await admin.from("agent_sessions").select("id").eq("campaign_id", campaignId).eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((row) => row.id as string);
    },

    removeClips: (at) => removeSittingClips(voiceStore, at),

    // By id and owner both, so the delete itself cannot reach another account's row.
    async deleteSession(sessionId, userId) {
      const { data, error } = await admin.from("agent_sessions").delete().eq("id", sessionId).eq("user_id", userId).select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  };

  try {
    const outcome = await forgetSitting({ userId: user.id, body, deps });
    if (!outcome.ok) return json(outcome.refusal.status, { error: outcome.refusal.error });
    return json(200, { deleted: outcome.deleted });
  } catch (error) {
    console.error("agent-forget failed:", error);
    return json(500, { error: "The sitting could not be deleted right now." });
  }
}));
