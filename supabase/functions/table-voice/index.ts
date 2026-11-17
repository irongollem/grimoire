// table-voice (#1021): speaks one line of a sitting at the AI table. The rules are `handler.ts`'s; this file wires
// the database and the speech service. NOT METERED: see the note at the top of `handler.ts`. It answers only where
// ELEVENLABS_API_KEY and TABLE_VOICE_TRIAL=on are both set.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { blocksOf, type StoredTurn } from "../_shared/agent/transcript.ts";
import type { AgentLine } from "../_shared/agent/types.ts";
import { speakLine, type TableVoiceDeps } from "./handler.ts";
import { ageOf, sexOf } from "./voicePick.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// The newest model: the one the maintainer chose by ear for how it acts a line.
const SPEECH_MODEL = "eleven_v4";
const SPEECH_TIMEOUT_MS = 30_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
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

  const speechKey = Deno.env.get("ELEVENLABS_API_KEY");

  const deps: TableVoiceDeps = {
    voiceOn: () => !!speechKey && Deno.env.get("TABLE_VOICE_TRIAL") === "on",

    async loadSession(sessionId) {
      const { data, error } = await admin.from("agent_sessions").select("id, user_id, campaign_id").eq("id", sessionId).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, user_id: data.user_id as string, campaign_id: data.campaign_id as string } : null;
    },

    async loadCampaign(campaignId) {
      const { data, error } = await admin.from("campaigns").select("id, user_id, ai_enabled").eq("id", campaignId).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, user_id: data.user_id as string, ai_enabled: data.ai_enabled as boolean | null } : null;
    },

    isDm: (campaign, userId) => isCampaignDm(admin, campaign, userId),
    rateLimit: (userId) => checkRateLimit(admin, userId, "table_voice"),

    // The conversation's own rows, already confirmed to be the caller's. Only the spoken lines leave this function.
    async loadSpokenLines(sessionId) {
      const { data, error } = await admin.from("agent_turns").select("seq, role, blocks").eq("session_id", sessionId).order("seq", { ascending: true });
      if (error) throw error;
      const lines: AgentLine[] = [];
      for (const row of (data ?? []) as StoredTurn[]) {
        for (const block of blocksOf(row)) {
          if (block.type === "tool_result") for (const line of block.lines ?? []) if (line.kind === "spoken") lines.push(line);
        }
      }
      return lines;
    },

    // Read as the caller, in the campaign: the record is only used to cast a voice and nothing of it is returned.
    async loadTraits(campaignId, speakerId) {
      const { data, error } = await supabase.from("npcs").select("age, appearance, personality, backstory").eq("id", speakerId).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      if (!data) return { sex: null, age: null };
      const about = [data.appearance, data.personality, data.backstory].map((t) => toPlainText(t as string | null)).join(" ");
      return { sex: sexOf(about), age: ageOf(String(data.age ?? "")) };
    },

    async synthesize(voiceId, text) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": speechKey ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: SPEECH_MODEL }),
        signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
      // The service's own message can quote the request; only the status is logged.
      if (!response.ok) throw new Error(`speech service answered ${response.status}`);
      return base64(new Uint8Array(await response.arrayBuffer()));
    },
  };

  try {
    const outcome = await speakLine({ userId: user.id, body, deps });
    if (!outcome.ok) return json(outcome.refusal.status, { error: outcome.refusal.error });
    return json(200, { audio: outcome.audio, mime: outcome.mime });
  } catch (error) {
    console.error("table-voice failed:", error);
    return json(500, { error: "The line could not be spoken right now." });
  }
}));
