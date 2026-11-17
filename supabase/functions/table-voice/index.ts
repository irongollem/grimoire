// table-voice (#1021): speaks one line of a sitting at the AI table. The rules are `handler.ts`'s; this file wires
// the database and the speech service. NOT METERED: see the note at the top of `handler.ts`. It answers only where
// ELEVENLABS_API_KEY and TABLE_VOICE_TRIAL=on are both set.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { clipName, lineKeyFits } from "../_shared/agent/lineKey.ts";
import { getObject, putObject } from "../_shared/r2/client.ts";
import { r2ConfigFrom } from "../_shared/r2/config.ts";
import { shownInTurns, speakLine, type TableVoiceDeps } from "./handler.ts";
import { deliveryCue } from "../_shared/agent/characterTurn.ts";
import { ageOf, sexFromGender, sexOf } from "./voicePick.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// The newest model: the one the maintainer chose by ear for how it acts a line.
const SPEECH_MODEL = "eleven_v4";
const SPEECH_TIMEOUT_MS = 30_000;

// The clips have a store of their own (the maintainer's choice, 17 Nov 2026): a private R2 bucket that nothing
// serves but this function, to the conversation's own owner. Without R2 credentials nothing is kept and every line
// is made anew, as before.
const VOICE_BUCKET = Deno.env.get("R2_VOICE_BUCKET")?.trim() || "grimoire-table-voices";
const r2 = r2ConfigFrom((key) => Deno.env.get(key));
const voiceStore = r2 === null ? null : { ...r2, bucket: VOICE_BUCKET };
const clipKey = (at: { campaignId: string; sessionId: string }, name: string) => `${at.campaignId}/${at.sessionId}/${name}.mp3`;

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** "she/her" as words the pronoun count can read. */
const pronounWords = (pronouns: string): string => pronouns.replace(/[/,;|]+/g, " ");

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

    keyFits: (sessionId, line, key) => lineKeyFits(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", sessionId, line, key),

    // Read as the caller, in the campaign: the record is only used to cast a voice and nothing of it is returned.
    async loadTraits(campaignId, speakerId) {
      const { data, error } = await supabase.from("npcs").select("age, appearance, personality, backstory, spoken_voice_id").eq("id", speakerId).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      if (!data) return { sex: null, age: null, voiceId: null };
      const about = [data.appearance, data.personality, data.backstory].map((t) => toPlainText(t as string | null)).join(" ");
      return { sex: sexOf(about), age: ageOf(String(data.age ?? "")), voiceId: (data.spoken_voice_id as string | null) ?? null };
    },

    async loadClip(at, line) {
      if (voiceStore === null) return null;
      const bytes = await getObject(voiceStore, clipKey(at, clipName(line)));
      return bytes === null ? null : base64(bytes);
    },

    async keepClip(at, line, audio) {
      if (voiceStore === null) return;
      await putObject(voiceStore, { key: clipKey(at, clipName(line)), body: fromBase64(audio), contentType: "audio/mpeg" });
    },

    // The conversation's own turns, read as the caller (their own rows). The cue is cleaned again: it was stored
    // by this code but comes back from jsonb and ends up inside a voice's instruction.
    async findShown(sessionId, line) {
      const { data, error } = await supabase.from("agent_turns").select("role, blocks").eq("session_id", sessionId).eq("user_id", user.id);
      if (error) throw error;
      const found = shownInTurns((data ?? []) as Array<{ role: string; blocks: unknown }>, line);
      return found === null ? null : { how: found.how === null ? null : deliveryCue(found.how) };
    },

    // The player's character: cast from the sheet's gender, then their pronouns, or from how their sheet describes them when the pronouns
    // are left empty (a sheet that says "she" throughout was cast as a man). Read as the caller, in the campaign.
    async loadPlayerTraits(campaignId, memberId) {
      const { data, error } = await supabase
        .from("party_members")
        .select("gender, pronouns, physical_description, player_description, personality_traits, notes")
        .eq("id", memberId)
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { sex: null, age: null, voiceId: null };
      const stated = sexFromGender(String(data.gender ?? "")) ?? sexOf(pronounWords(String(data.pronouns ?? "")));
      const about = [data.physical_description, data.player_description, data.personality_traits, data.notes].map((t) => toPlainText(t as string | null)).join(" ");
      return { sex: stated ?? sexOf(about), age: null, voiceId: null };
    },

    narratorVoice: () => Deno.env.get("TABLE_NARRATOR_VOICE_ID")?.trim() || null,

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
