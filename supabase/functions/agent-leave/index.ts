// agent-leave (#1021): the player leaves the AI table. The rules are `handler.ts`'s; this file wires the database.
// The session is ended and the note written through the caller's own client, so the database checks they are the
// campaign's DM; the service role only reads and marks the conversation, which no client may write.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { setPressureClock } from "../_shared/agent/pressureClock.ts";
import { leaveTable, type AgentLeaveDeps, type LeaveSession } from "./handler.ts";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const deps: AgentLeaveDeps = {
    async loadSession(sessionId): Promise<LeaveSession | null> {
      const { data, error } = await admin
        .from("agent_sessions")
        .select("id, user_id, campaign_id, provider, model, campaign_session_id, opened_play_session, party_member_id")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
          id: data.id as string,
          user_id: data.user_id as string,
          campaign_id: data.campaign_id as string,
          provider: data.provider as string,
          model: data.model as string,
          campaign_session_id: (data.campaign_session_id as string | null) ?? null,
          opened_play_session: data.opened_play_session === true,
          party_member_id: (data.party_member_id as string | null) ?? null,
        }
        : null;
    },

    // Conditional on `left_at is null`, so of two leaves at once only one is told it got there first.
    async markLeft(sessionId): Promise<boolean> {
      const { data, error } = await admin
        .from("agent_sessions")
        .update({ left_at: new Date().toISOString() })
        .eq("id", sessionId)
        .is("left_at", null)
        .select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },

    endPressure: (sessionId, campaignId) => setPressureClock(admin, { agentSessionId: sessionId, campaignId }, null),

    async openPlaySessionId(campaignId): Promise<string | null> {
      const { data, error } = await supabase
        .from("campaign_sessions")
        .select("id")
        .eq("campaign_id", campaignId)
        .not("started_at", "is", null)
        .is("ended_at", null)
        .limit(1);
      if (error) throw error;
      return data && data.length > 0 ? (data[0].id as string) : null;
    },

    async endPlaySession(campaignId): Promise<void> {
      const { error } = await supabase.rpc("end_campaign_session", { p_campaign_id: campaignId });
      if (error) throw error;
    },

    async loadFacts(sessionId) {
      const { data, error } = await supabase
        .from("story_facts")
        .select("body, known_to_player")
        .eq("agent_session_id", sessionId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({ body: row.body as string, known_to_player: row.known_to_player === true }));
    },

    async characterName(campaignId, characterId): Promise<string | null> {
      const { data, error } = await supabase
        .from("party_members")
        .select("name")
        .eq("id", characterId)
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error) throw error;
      return data && typeof data.name === "string" && data.name.trim() !== "" ? data.name.trim() : null;
    },

    async writeNote({ campaignId, playSessionId, title, content, provenance, visibleTo }): Promise<string> {
      const { data, error } = await supabase
        .from("notes")
        .insert({
          user_id: user.id,
          campaign_id: campaignId,
          title,
          content,
          category: "session",
          session_id: playSessionId,
          tags: [],
          player_visible_to: visibleTo,
          ai_provenance: provenance,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
  };

  try {
    const outcome = await leaveTable({ userId: user.id, body, deps });
    if (!outcome.ok) return json(outcome.refusal.status, { error: outcome.refusal.error });
    return json(200, outcome.result);
  } catch (error) {
    console.error("agent-leave failed:", error);
    return json(500, { error: "Leaving the table failed. Try again." });
  }
}));
