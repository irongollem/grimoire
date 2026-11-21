// note-reading (#1021 row 19): a note read aloud in the Narrator's voice. The rules are `handler.ts`'s; this file
// wires the database, the speech service and the voices' store. It answers only where voices are switched on for
// the stack (an ElevenLabs key in Admin > Providers, `voicesOn`), except for listening, which needs only the recording.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { isPromptRejected, screenImagePrompt } from "../_shared/moderation.ts";
import { isNarratorVoice } from "../_shared/narratorVoice.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { getObject, putObject } from "../_shared/r2/client.ts";
import { sweepNoteReadings, voiceStoreFrom } from "../_shared/agent/voiceClips.ts";
import { loadSpeechEnv } from "../_shared/speechKeys.ts";
import { type SpeechEnv, hasSpeechService, loadSpeechRate, speechModelOf, synthesizeSpeech, voicesOn, VoicesSpent } from "../_shared/speech.ts";
import { readNote, READING_MESSAGES, type NoteReadingDeps } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// The same private store the table's clips are kept in: nothing serves it but a function that has checked the caller.
const voiceStore = voiceStoreFrom((key) => Deno.env.get(key));

serve(serveUser(async ({ user, req, report, userClient: supabase }) => {
  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", "The request is not valid.");

  // The admin's keys, read for this request and only once something is to be spoken: listening to a recording
  // needs none. The handler asks `voiceOn` before anything else that speaks, so the sync `hasService` below only
  // ever runs after they are loaded; before that it answers false.
  let speech: SpeechEnv | undefined;
  const loadSpeech = async (): Promise<SpeechEnv> => (speech ??= await loadSpeechEnv(admin));

  const deps: NoteReadingDeps = {
    voiceOn: async () => voicesOn(await loadSpeech()) && voiceStore !== null,

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

    // The DM only (owner or co-DM). Making a reading needs AI on; tidying up does not, and a caller without access
    // is told the campaign is not there.
    loadCampaign: (campaignId, userId, purpose) =>
      loadAiCampaign(admin, campaignId, userId, purpose === "make"
        ? { aiSwitch: "table", forbiddenMessage: READING_MESSAGES.notDm }
        : { aiSwitch: false, hideFromOutsiders: true }),

    withinRate: (userId) => checkRateLimit(admin, userId, "note_reading"),

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

    hasService: (service) => speech !== undefined && hasSpeechService(speech, service),
    loadRate: async (service) => loadSpeechRate(admin, await loadSpeech(), service),

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

    // Named only once a reading was made, and making one asked `voiceOn` first, which loaded the keys.
    modelOf: (service) => {
      if (speech === undefined) throw new Error("note-reading: a model was named before the speech keys were read");
      return speechModelOf(speech, service);
    },

    withHold: (userId, credits, work) => withCreditHold(admin, { payerId: userId, reason: "note_reading", cost: credits, report }, work),

    synthesize: async (voice, text) => synthesizeSpeech(await loadSpeech(), voice, text),

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
    return await readNote({ userId: user.id, body, deps });
  } catch (error) {
    // The hold is already released and nothing charged: the throw passed through `withCreditHold`.
    if (error instanceof VoicesSpent) return jsonError(503, "voices_spent", "The voices have used up their allowance for now.");
    throw error;
  }
}));
