// note-reading (#1021 row 19): a note read aloud in the Narrator's voice. The rules are `handler.ts`'s; this file
// wires the database, the speech service and the voices' store. It answers only where voices are switched on for
// the stack (ELEVENLABS_API_KEY and TABLE_VOICE_TRIAL=on), except for listening, which needs only the recording.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { isCampaignDm } from "../_shared/campaignAccess.ts";
import { recordGeneration, releaseCredits, reserveCredits } from "../_shared/credits.ts";
import { isPromptRejected, screenImagePrompt } from "../_shared/moderation.ts";
import { isNarratorVoice } from "../_shared/narratorVoice.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { getObject, putObject } from "../_shared/r2/client.ts";
import { sweepNoteReadings, voiceStoreFrom } from "../_shared/agent/voiceClips.ts";
import { hasSpeechService, loadSpeechRate, speechEnvFrom, speechModelOf, synthesizeSpeech, VoicesSpent } from "../_shared/speech.ts";
import { readNote, type NoteReadingDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const speech = speechEnvFrom((key) => Deno.env.get(key));
// The same private store the table's clips are kept in: nothing serves it but a function that has checked the caller.
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

  const deps: NoteReadingDeps = {
    voiceOn: () => !!speech.elevenKey && Deno.env.get("TABLE_VOICE_TRIAL") === "on" && voiceStore !== null,

    async loadNote(noteId) {
      const { data, error } = await admin.from("notes").select("id, campaign_id, reading_hash, reading_voice").eq("id", noteId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id as string,
        campaign_id: (data.campaign_id as string | null) ?? null,
        reading_hash: (data.reading_hash as string | null) ?? null,
        reading_voice: isNarratorVoice(data.reading_voice) ? data.reading_voice : null,
      };
    },

    async loadCampaign(campaignId) {
      const { data, error } = await admin.from("campaigns").select("id, user_id, ai_enabled").eq("id", campaignId).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, user_id: data.user_id as string, ai_enabled: data.ai_enabled as boolean | null } : null;
    },

    isDm: (campaign, userId) => isCampaignDm(admin, campaign, userId),

    // As the caller, through the two ways a note is read: the table's own policy (its owner, the campaign's DM)
    // and the players' reading of shared notes. Either finding the note is enough.
    async mayRead(campaignId, noteId) {
      const own = await supabase.from("notes").select("id").eq("id", noteId).eq("campaign_id", campaignId).maybeSingle();
      if (own.error) throw own.error;
      if (own.data) return true;
      const shared = await supabase.rpc("get_player_visible_notes", { p_campaign_id: campaignId });
      if (shared.error) throw shared.error;
      return ((shared.data ?? []) as Array<{ id: string }>).some((n) => n.id === noteId);
    },

    async playerText(noteId) {
      const { data, error } = await admin.rpc("note_text_for_reading", { p_note_id: noteId });
      if (error) throw error;
      return typeof data === "string" ? data : null;
    },

    hasService: (service) => hasSpeechService(speech, service),
    loadRate: (service) => loadSpeechRate(admin, speech, service),

    // The same screen the table's own lines go through, logged under this surface.
    async isFlagged(text) {
      try {
        const keys = await fetchPlatformKeys(admin, ["openai"]);
        await screenImagePrompt(text, { apiKey: keys.openai ?? null, admin, userId: user.id, generationType: "note_reading", imageProvider: "none" });
        return false;
      } catch (error) {
        if (isPromptRejected(error)) return true;
        throw error;
      }
    },

    async reserve(userId, credits) {
      const reservation = await reserveCredits(admin, userId, credits, "note_reading");
      if (reservation.ok) return { ok: true, ids: reservation.ids };
      if (reservation.suspended) return { ok: false, status: 403, error: "account_suspended" };
      if (reservation.child_account) return { ok: false, status: 403, error: "child_account" };
      if (reservation.velocity) return { ok: false, status: 429, error: "rate_limited" };
      if (reservation.insufficient) return { ok: false, status: 402, error: "insufficient_credits" };
      return { ok: false, status: 503, error: "Reading aloud cannot be metered right now." };
    },

    release: (ids) => releaseCredits(admin, ids),

    async charge(userId, credits, log) {
      await recordGeneration(admin, userId, "note_reading", false, credits, { provider: log.service, model: speechModelOf(speech, log.service) });
    },

    synthesize: (voice, text) => synthesizeSpeech(speech, voice, text),

    async loadAudio(key) {
      return voiceStore === null ? null : await getObject(voiceStore, key);
    },

    async keepAudio(key, audio) {
      if (voiceStore === null) throw new Error("note-reading: no store to keep the recording in");
      await putObject(voiceStore, { key, body: audio, contentType: "audio/mpeg" });
    },

    async campaignExists(campaignId) {
      const { data, error } = await admin.from("campaigns").select("id").eq("id", campaignId).maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    // What each note of the campaign refers to now; everything else under the campaign's prefix goes.
    async sweep(campaignId) {
      const { data, error } = await admin.from("notes").select("id, reading_hash").eq("campaign_id", campaignId).not("reading_hash", "is", null);
      if (error) throw error;
      const keep = new Map((data ?? []).map((n) => [n.id as string, n.reading_hash as string]));
      return sweepNoteReadings(voiceStore, campaignId, keep);
    },

    // Through the database's own function, so the reading's time is the row's own (see the migration).
    async setReading(noteId, reading) {
      const { error } = await admin.rpc("set_note_reading", { p_note_id: noteId, p_hash: reading.hash, p_voice: reading.voice, p_chars: reading.chars });
      if (error) throw error;
    },
  };

  try {
    const outcome = await readNote({ userId: user.id, body, deps });
    if (!outcome.ok) return json(outcome.status, { error: outcome.error });
    if (outcome.kind === "audio") return new Response(outcome.audio, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
    if (outcome.kind === "swept") return json(200, { removed: outcome.removed });
    return json(200, outcome.kind === "estimate" ? { chars: outcome.chars, credits: outcome.credits, has: outcome.has } : { made: true, chars: outcome.chars, credits: outcome.credits });
  } catch (error) {
    if (error instanceof VoicesSpent) return json(503, { error: "voices_spent" });
    console.error("note-reading failed:", error);
    return json(500, { error: "The note could not be read aloud right now." });
  }
}));
