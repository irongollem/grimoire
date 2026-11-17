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
import { clipKey, voiceStoreFrom } from "../_shared/agent/voiceClips.ts";
import { shownInTurns, speakLine, voiceRates, VoicesSpent, type TableVoiceDeps } from "./handler.ts";
import { recordGeneration, releaseCredits, reserveCredits } from "../_shared/credits.ts";
import { deliveryCue } from "../_shared/agent/characterTurn.ts";
import { ageOf, inworldText, NARRATION_MAX_CHARS, sexFromGender, sexOf, speechText } from "./voicePick.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Eleven v4 Turbo: half the cost of v4 and two to three times sooner back. The maintainer compared the two by ear on
// three voices (17 Nov 2026): "every turbo is almost identical to the non turbo, unless its for a very specific
// project i think turbo is fine". `TABLE_VOICE_MODEL` names another for such a project (`eleven_v4` for the fuller
// acting); a clip already kept was made by whichever model spoke it first.
const SPEECH_MODEL = Deno.env.get("TABLE_VOICE_MODEL")?.trim() || "eleven_v4_turbo";
const SPEECH_TIMEOUT_MS = 30_000;
const INWORLD_MODEL = "inworld-tts-2";

// The clips have a store of their own (the maintainer's choice, 17 Nov 2026): a private R2 bucket that nothing
// serves but this function, to the conversation's own owner. Without R2 credentials nothing is kept and every line
// is made anew, as before.
const voiceStore = voiceStoreFrom((key) => Deno.env.get(key));

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
  // A second service for the voices ElevenLabs will not make. Without its key those characters are cast like anyone else.
  const inworldKey = Deno.env.get("INWORLD_API_KEY");

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

    // The admin's numbers: what the service's model costs by the character, and what a credit is worth.
    async loadRate(service) {
      const model = service === "inworld" ? INWORLD_MODEL : SPEECH_MODEL;
      const [price, calibration] = await Promise.all([
        admin.from("ai_model_pricing").select("cost_per_million_characters_usd").eq("model", model).maybeSingle(),
        admin.rpc("agent_credit_calibration"),
      ]);
      if (price.error) throw price.error;
      if (calibration.error) throw calibration.error;
      const row = Array.isArray(calibration.data) ? calibration.data[0] : calibration.data;
      const rate = price.data?.cost_per_million_characters_usd;
      if (rate === null || rate === undefined || !row || row.usd_per_credit === null) return null;
      const usdPerMillionChars = Number(rate);
      const usdPerCredit = Number(row.usd_per_credit);
      const margin = Number(row.margin);
      if (!(usdPerMillionChars > 0) || !(usdPerCredit > 0) || !(margin > 0)) return null;
      return { usdPerMillionChars, calibration: { usdPerCredit, margin } };
    },

    async reserve(userId, credits) {
      const reservation = await reserveCredits(admin, userId, credits, "table_voice");
      if (reservation.ok) return { ok: true, ids: reservation.ids };
      if (reservation.suspended) return { ok: false, status: 403, error: "account_suspended" };
      if (reservation.child_account) return { ok: false, status: 403, error: "child_account" };
      if (reservation.velocity) return { ok: false, status: 429, error: "rate_limited" };
      if (reservation.insufficient) return { ok: false, status: 402, error: "insufficient_credits" };
      return { ok: false, status: 503, error: "Voices cannot be metered right now." };
    },

    release: (ids) => releaseCredits(admin, ids),

    // The exact cost goes on the conversation; only the whole credits its running total newly crossed are billed.
    async charge(at, credits, log) {
      const { data, error } = await admin.rpc("accrue_agent_voice", { p_session_id: at.sessionId, p_credits: credits });
      if (error) throw error;
      const due = typeof data === "number" && Number.isInteger(data) && data > 0 ? data : 0;
      if (due > 0) await recordGeneration(admin, at.userId, "table_voice", false, due, { provider: log.service, model: log.service === "inworld" ? INWORLD_MODEL : SPEECH_MODEL });
    },

    hasService: (service) => (service === "inworld" ? !!inworldKey : !!speechKey),

    async synthesize(voice, line) {
      const max = line.narration ? NARRATION_MAX_CHARS : undefined;
      if (voice.service === "inworld") {
        const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
          method: "POST",
          headers: { Authorization: `Basic ${inworldKey ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ modelId: INWORLD_MODEL, text: inworldText(line.text, line.how, max), voiceId: voice.id, audioConfig: { audioEncoding: "MP3" } }),
          signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`inworld answered ${response.status}`);
        const body = (await response.json().catch(() => null)) as { audioContent?: unknown } | null;
        if (!body || typeof body.audioContent !== "string" || body.audioContent === "") throw new Error("inworld answered without audio");
        return body.audioContent;
      }
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.id)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": speechKey ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ text: speechText(line.text, line.how, max), model_id: SPEECH_MODEL }),
        signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Only the service's own status word is read, never its message.
        const detail = (await response.json().catch(() => null)) as { detail?: { status?: unknown } } | null;
        if (detail?.detail?.status === "quota_exceeded") throw new VoicesSpent("the speech allowance is used up");
        throw new Error(`speech service answered ${response.status}`);
      }
      return base64(new Uint8Array(await response.arrayBuffer()));
    },
  };

  try {
    // Asked before anyone sits down: what a minute of speech costs. Any signed-in account may ask; it names no
    // campaign and returns only the stack's own rates.
    if (typeof body === "object" && body !== null && (body as { rates?: unknown }).rates === true) {
      return json(200, await voiceRates(deps));
    }
    const outcome = await speakLine({ userId: user.id, body, deps });
    if (!outcome.ok) return json(outcome.refusal.status, { error: outcome.refusal.error });
    return json(200, { audio: outcome.audio, mime: outcome.mime });
  } catch (error) {
    console.error("table-voice failed:", error);
    return json(500, { error: "The line could not be spoken right now." });
  }
}));
