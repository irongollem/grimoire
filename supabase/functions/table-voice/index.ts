// table-voice (#1021): speaks one line of a sitting at the AI table. The rules are `handler.ts`'s; this file wires
// the database and the speech service. It answers only where the stack has
// voices on (`voicesOn`, `_shared/speech.ts`).
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { toPlainText } from "../_shared/ai-prompt.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { clipName, lineKeyFits } from "../_shared/agent/lineKey.ts";
import { getObject, putObject } from "../_shared/r2/client.ts";
import { clipKey, voiceStoreFrom } from "../_shared/agent/voiceClips.ts";
import { NO_TRAITS, shownInTurns, speakLine, VOICE_MESSAGES, voiceRates, type TableVoiceDeps } from "./handler.ts";
import { base64FromBytes } from "../_shared/base64.ts";
import { bytesFromBase64, hasSpeechService, loadSpeechRate, speechModelOf, synthesizeSpeech, voicesOn } from "../_shared/speech.ts";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { loadAiCampaign } from "../_shared/pipeline/aiCampaign.ts";
import { withCreditHold } from "../_shared/pipeline/creditHold.ts";
import { screenChatText } from "../_shared/moderation.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { loadSpeechEnv } from "../_shared/speechKeys.ts";
import { deliveryCue } from "../_shared/agent/characterTurn.ts";
import { choiceOf, judge, JEV_MODEL } from "../_shared/typesafe.ts";
import type { VoiceSlot } from "./casting.ts";
import { ageOf, inworldText, isNarratorVoice, NARRATION_MAX_CHARS, sexFromGender, sexOf, speechText } from "./voicePick.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// The clips have a store of their own (the maintainer's choice, 17 Nov 2026): a private R2 bucket that nothing
// serves but this function, to the conversation's own owner. Without R2 credentials nothing is kept and every line
// is made anew, as before.
const voiceStore = voiceStoreFrom((key) => Deno.env.get(key));

const SLOT_COLUMNS = "id, name, description, sex, age, service, voice_id, active";
/** How long the judgment may take before the least used slot is taken instead. */
const JEV_TIMEOUT_MS = 4000;
/** The most of a character's record sent to the judgment model. */
const FITTING_MAX_CHARS = 1500;

/** A slot row as a filled, active slot; null for one that cannot speak (unfilled or retired). */
function slotOf(row: Record<string, unknown>): VoiceSlot | null {
  if (row.active !== true || (row.service !== "elevenlabs" && row.service !== "inworld") || typeof row.voice_id !== "string") return null;
  return { id: row.id as string, name: row.name as string, description: row.description as string, sex: (row.sex as VoiceSlot["sex"]) ?? null, age: (row.age as VoiceSlot["age"]) ?? null, service: row.service, voiceId: row.voice_id };
}

/** "she/her" as words the pronoun count can read. */
const pronounWords = (pronouns: string): string => pronouns.replace(/[/,;|]+/g, " ");

serve(serveUser(async ({ user, req, report, userClient: supabase }) => {
  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "invalid_body", "The request is not valid.");

  // The admin's keys, read for this request.
  const speech = await loadSpeechEnv(admin);

  const deps: TableVoiceDeps = {
    voiceOn: () => voicesOn(speech),

    async loadSession(sessionId) {
      const { data, error } = await admin.from("agent_sessions").select("id, user_id, campaign_id, narrator_voice, kind").eq("id", sessionId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // The column's check allows the two voices only, so anything else is a row this code cannot read: say so.
      if (!isNarratorVoice(data.narrator_voice)) throw new Error("table-voice: a table's narrator_voice is neither of the two voices");
      return { id: data.id as string, user_id: data.user_id as string, campaign_id: data.campaign_id as string, narrator_voice: data.narrator_voice, kind: data.kind as string };
    },

    // The DM only. The table's voices follow the table switch; Oolu, in Ask, follows the campaign's AI switch alone.
    loadCampaign: (campaignId, userId, aiSwitch) => loadAiCampaign(admin, campaignId, userId, { aiSwitch, forbiddenMessage: VOICE_MESSAGES.forbidden }),
    rateLimit: (userId) => checkRateLimit(admin, userId, "table_voice"),

    keyFits: (sessionId, line, key) => lineKeyFits(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", sessionId, line, key),

    // Read as the caller, in the campaign: the record is only used to cast a voice and nothing of it is returned.
    // Sex is read from everything the record says about the person (a backstory is full of pronouns); the text a
    // slot is matched on leaves the backstory and the DM's notes out, since secrets must not steer a voice.
    async loadTraits(campaignId, speakerId) {
      const { data, error } = await supabase
        .from("npcs")
        .select("age, occupation, appearance, personality, voice, backstory, speech_voice_id, location_id")
        .eq("id", speakerId)
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return NO_TRAITS;
      const text = (t: unknown): string => toPlainText(t as string | null);
      const fitting = [data.occupation, data.appearance, data.personality, data.voice].map(text).filter((t) => t !== "").join("\n").slice(0, FITTING_MAX_CHARS);
      return {
        sex: sexOf([data.appearance, data.personality, data.backstory].map(text).join(" ")),
        age: ageOf(String(data.age ?? "")),
        hasRecord: true,
        slotId: (data.speech_voice_id as string | null) ?? null,
        locationId: (data.location_id as string | null) ?? null,
        fitting,
      };
    },

    // Read as the caller: a slot they cannot read (retired, unfilled, someone else's signature voice) is null.
    async loadSlot(slotId) {
      const { data, error } = await supabase.from("speech_voices").select(SLOT_COLUMNS).eq("id", slotId).maybeSingle();
      if (error) throw error;
      return data === null ? null : slotOf(data);
    },

    async loadSlots() {
      const { data, error } = await supabase.from("speech_voices").select(SLOT_COLUMNS).eq("kind", "cast").eq("active", true).not("voice_id", "is", null);
      if (error) throw error;
      return (data ?? []).map(slotOf).filter((slot): slot is VoiceSlot => slot !== null);
    },

    async loadAssignments(campaignId) {
      const { data, error } = await supabase.from("npcs").select("id, speech_voice_id, location_id").eq("campaign_id", campaignId).not("speech_voice_id", "is", null);
      if (error) throw error;
      return (data ?? []).map((r) => ({ npcId: r.id as string, slotId: r.speech_voice_id as string, locationId: (r.location_id as string | null) ?? null }));
    },

    // Jev, the judgment model: one choice among the slots. Short on purpose: a line is waiting, and past this the
    // least used slot is taken. Without the platform's key it does not run. Its tokens are the platform's cost.
    async judgeSlot(options, fitting) {
      if (options.length === 0 || fitting.trim() === "") return null;
      const keys = await fetchPlatformKeys(admin, ["typesafe"]);
      const apiKey = keys.typesafe && keys.typesafe.length > 0 ? keys.typesafe : null;
      if (apiKey === null) return null;
      const result = await judge(
        {
          model: JEV_MODEL,
          state: { character: fitting },
          questions: {
            voice: {
              type: "choice",
              instructions: "Which voice would suit this character best, going by who they are and how they would sound?",
              criteria: Object.fromEntries(options.map((o) => [o.name, o.description || o.name])),
            },
          },
        },
        { apiKey, timeoutMs: JEV_TIMEOUT_MS, signal: AbortSignal.timeout(JEV_TIMEOUT_MS) },
      );
      return { choice: choiceOf(result, "voice")?.choice ?? null, inputTokens: result.inputTokens };
    },

    async saveSlot(campaignId, npcId, slotId) {
      const { error } = await supabase.from("npcs").update({ speech_voice_id: slotId }).eq("id", npcId).eq("campaign_id", campaignId);
      if (error) throw error;
    },

    async loadClip(at, line) {
      if (voiceStore === null) return null;
      const bytes = await getObject(voiceStore, clipKey(at, clipName(line)));
      return bytes === null ? null : base64FromBytes(bytes);
    },

    async keepClip(at, line, audio) {
      if (voiceStore === null) return;
      await putObject(voiceStore, { key: clipKey(at, clipName(line)), body: bytesFromBase64(audio), contentType: "audio/mpeg" });
    },

    // The conversation's own turns, read as the caller (their own rows). The cue is cleaned again: it was stored
    // by this code but comes back from jsonb and ends up inside a voice's instruction.
    async findShown(sessionId, line) {
      const { data, error } = await supabase.from("agent_turns").select("role, blocks").eq("session_id", sessionId).eq("user_id", user.id).order("seq", { ascending: true });
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
      if (!data) return NO_TRAITS;
      const stated = sexFromGender(String(data.gender ?? "")) ?? sexOf(pronounWords(String(data.pronouns ?? "")));
      const about = [data.physical_description, data.player_description, data.personality_traits, data.notes].map((t) => toPlainText(t as string | null)).join(" ");
      return { ...NO_TRAITS, sex: stated ?? sexOf(about) };
    },

    // The same screen the turn's own words go through (`_shared/moderation.ts`), logged under this surface.
    async isFlagged(text) {
      // The moderation endpoint is free, and the platform's own key is the one used for it, as in `agent-turn`.
      const keys = await fetchPlatformKeys(admin, ["openai"]);
      const verdict = await screenChatText(text, { apiKey: keys.openai ?? null, admin, userId: user.id, surface: "table_voice" });
      return verdict?.flagged === true;
    },

    loadRate: (service) => loadSpeechRate(admin, speech, service),

    modelOf: (service) => speechModelOf(speech, service),

    withHold: (userId, credits, reason, work) => withCreditHold(admin, { payerId: userId, reason, cost: credits, report }, work),

    // The exact cost goes on the conversation; only the whole credits its running total newly crossed are billed.
    async accrue(sessionId, credits) {
      const { data, error } = await admin.rpc("accrue_agent_voice", { p_session_id: sessionId, p_credits: credits });
      if (error) throw error;
      return typeof data === "number" && Number.isInteger(data) && data > 0 ? data : 0;
    },

    hasService: (service) => hasSpeechService(speech, service),

    // Each service takes a cue its own way (`voicePick.ts`); the call itself is everyone's (`_shared/speech.ts`).
    async synthesize(voice, line) {
      const max = line.narration ? NARRATION_MAX_CHARS : undefined;
      const text = voice.service === "inworld" ? inworldText(line.text, line.how, max) : speechText(line.text, line.how, max);
      return base64FromBytes(await synthesizeSpeech(speech, voice, text));
    },
  };

  // Asked before anyone sits down: what a minute of speech costs. Any signed-in account may ask; it names no
  // campaign and returns only the stack's own rates.
  if ((body as { rates?: unknown }).rates === true) return json(await voiceRates(deps));
  return speakLine({ userId: user.id, body, deps });
}));
