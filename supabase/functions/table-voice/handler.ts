// table-voice (#1021): one spoken line of a sitting at the AI table, as audio. No Deno and no Supabase in here;
// everything with I/O comes in through `TableVoiceDeps`, so the rules are tested against an in-memory harness
// (`handler.test.ts`) and `index.ts` only wires real dependencies to them.
//
// What keeps this from being a speech service for anything a caller types:
//   - the caller must own the conversation, in a campaign they run with AI on;
//   - a line already voiced is kept (`loadClip` / `keepClip`, the `grimoire-table-voices` store) under its
//     conversation and a name made of who said what. Asked for again, it is answered from there: nothing is paid
//     twice, and a reopened sitting can be heard again. A kept clip needs no key, because only a line that came
//     with one was ever kept;
//   - the words must be a line that conversation SHOWED, spoken by that speaker, with the cue the character gave.
//     `agent-turn` signs each spoken line as it sends it (`_shared/agent/lineKey.ts`); the request carries the line
//     and its key, and a line whose key does not fit is refused. So a line is voiced the moment it is shown, not
//     once its turn is kept, and nothing about it can be changed by the page.
//
// NOT METERED YET. Every call is a paid request to a speech service on the platform's key, and nothing here charges
// credits for it. So it answers only where both the key and `TABLE_VOICE_TRIAL=on` are set, which today is the
// maintainer's own stack. Before either is set in production, voice has to be priced and charged like every other
// generation (`_shared/credits.ts`).

import { creditsForSpeech, creditsPerMinute, speechChars } from "../_shared/agent/voiceCost.ts";
import type { CreditCalibration } from "../_shared/agent/metering.ts";
import { NARRATOR_VOICES, pickVoice, type AgeBand, type NarratorVoice, type Sex } from "./voicePick.ts";
import { VOICE_ROLES, type VoiceRole } from "../_shared/agent/lineKey.ts";

export interface VoiceRefusal {
  status: number;
  error: string;
}

export interface VoiceSession {
  id: string;
  user_id: string;
  campaign_id: string;
  /** The voice the table's host chose for the Narrator. The table's, never a player's: a line's clip is made once. */
  narrator_voice: NarratorVoice;
}

export interface VoiceCampaign {
  id: string;
  user_id: string;
  ai_enabled: boolean | null;
}

export interface TableVoiceDeps {
  /** Whether voices are switched on for this stack: the speech key and the trial switch are both set. */
  voiceOn(): boolean;
  /** By id alone: the handler decides whether it belongs to the caller. */
  loadSession(sessionId: string): Promise<VoiceSession | null>;
  loadCampaign(campaignId: string): Promise<VoiceCampaign | null>;
  isDm(campaign: VoiceCampaign, userId: string): Promise<boolean>;
  rateLimit(userId: string): Promise<boolean>;
  /** Whether the key is the one `agent-turn` gave for exactly this line of this conversation. */
  keyFits(sessionId: string, line: VoicedLine, key: string): boolean;
  /** The clip kept for this line of this conversation (mp3, base64), or null when none is. Throws are the caller's to survive. */
  loadClip(at: { campaignId: string; sessionId: string }, line: VoicedLine): Promise<string | null>;
  /** Keeps the clip for the line, so it is never made twice. */
  keepClip(at: { campaignId: string; sessionId: string }, line: VoicedLine, audio: string): Promise<void>;
  /**
   * For a line asked for without a key: whether the conversation's own stored turns hold it, and the cue it was
   * stored with. Null when they do not.
   */
  findShown(sessionId: string, line: VoicedLine): Promise<{ how: string | null } | null>;
  /** The played character's own pronouns and voice, for the player's said lines. */
  loadPlayerTraits(campaignId: string, memberId: string): Promise<SpeakerTraits>;
  /**
   * What the character's record says of its sex and age, for casting, and the voice the DM gave it
   * (`npcs.spoken_voice_id`); nulls when it says nothing or has no record.
   */
  loadTraits(campaignId: string, speakerId: string): Promise<SpeakerTraits>;
  /** Whether this stack can speak through the service (its key is set). */
  hasService(service: VoiceService): boolean;
  /**
   * Speaks the line in the voice and answers the audio (mp3, base64). The words and the cue are given apart: each
   * service takes a cue its own way. Throws when the speech service fails.
   */
  synthesize(voice: VoiceRef, line: { text: string; how: string | null; narration: boolean }): Promise<string>;
  /**
   * What the service's speech costs, in USD per million characters, and what a credit is worth: the admin's
   * numbers (`ai_model_pricing`, the credit calibration). Null when either is not on file: speech is then not made,
   * because it could not be charged.
   */
  /** True when the line must not be spoken (the same screen a turn's own words go through). Throws when it cannot run. */
  isFlagged(text: string): Promise<boolean>;
  loadRate(service: VoiceService): Promise<{ usdPerMillionChars: number; calibration: CreditCalibration } | null>;
  /** Holds credits for a line about to be made. Refused when the account cannot pay or may not spend. */
  reserve(userId: string, credits: number): Promise<{ ok: true; ids: string[] } | { ok: false; status: number; error: string }>;
  release(ids: string[]): Promise<void>;
  /** Adds the line's exact cost to the conversation and bills the whole credits it newly crossed. */
  charge(at: { sessionId: string; userId: string }, credits: number, log: { service: VoiceService; chars: number }): Promise<void>;
}

/** A line as it is signed, kept and spoken. */
export interface VoicedLine {
  role: VoiceRole;
  speaker: { id: string | null; name: string };
  text: string;
  how: string | null;
}

export interface SpeakerTraits {
  sex: Sex | null;
  age: AgeBand | null;
  voiceId: string | null;
}

/** A voice id as a speech service writes them. It goes into a URL or a request, so anything else is not used. */
export const VOICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** The services a voice may live on. ElevenLabs speaks for everyone by default; Inworld holds the voices ElevenLabs will not make (a child's). */
export type VoiceService = "elevenlabs" | "inworld";
export interface VoiceRef {
  service: VoiceService;
  id: string;
}

/** A stored voice reference read: a bare id is ElevenLabs', `inworld:<id>` is Inworld's. Null for anything else. */
export function voiceRefOf(stored: string | null): VoiceRef | null {
  if (stored === null) return null;
  const inworld = stored.startsWith("inworld:");
  const id = inworld ? stored.slice("inworld:".length) : stored;
  return VOICE_ID_RE.test(id) ? { service: inworld ? "inworld" : "elevenlabs", id } : null;
}

/** The voice the DM gave the character, or null when there is none or it is not a voice reference. */
export function ownVoice(traits: Pick<SpeakerTraits, "voiceId">): VoiceRef | null {
  return voiceRefOf(traits.voiceId);
}

/** Thrown by `synthesize` when the speech service says its allowance is used up: asking again cannot help. */
export class VoicesSpent extends Error {}

export const VOICE_MESSAGES = {
  badBody: "The request is not valid.",
  off: "Voices are not switched on.",
  notFound: "That conversation was not found.",
  aiOff: "AI is disabled for this campaign.",
  forbidden: "Only the campaign's DM can use the AI table.",
  rateLimited: "rate_limited",
  noLine: "That line is not one this sitting has shown.",
  failed: "The line could not be spoken right now.",
  spent: "voices_spent",
  unpriced: "Voices cannot be metered right now.",
  unspeakable: "That line cannot be read aloud.",
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VoiceBody {
  campaignId: string;
  sessionId: string;
  /** The speaker's record, or null for someone with no record. */
  speakerId: string | null;
  speakerName: string;
  text: string;
  /** The character's cue for how it is said, as the line carried it; null when it had none. */
  how: string | null;
  /** The key the line came with; null for a line read back from a stored conversation, which only a kept clip answers. */
  key: string | null;
  /** Whose words: a character's (the default), the narrator's, or the player's own character's. */
  role: VoiceRole;
}

export function parseVoiceBody(raw: unknown): VoiceBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.campaignId !== "string" || !UUID_RE.test(r.campaignId)) return null;
  if (typeof r.sessionId !== "string" || !UUID_RE.test(r.sessionId)) return null;
  if (r.speakerId !== null && (typeof r.speakerId !== "string" || !UUID_RE.test(r.speakerId))) return null;
  if (typeof r.speakerName !== "string" || r.speakerName.trim() === "" || r.speakerName.length > 200) return null;
  if (typeof r.text !== "string" || r.text.trim() === "" || r.text.length > 4000) return null;
  const how = r.how === undefined || r.how === null ? null : r.how;
  if (how !== null && (typeof how !== "string" || how.length > 400)) return null;
  const key = r.key === undefined || r.key === null ? null : r.key;
  if (key !== null && (typeof key !== "string" || key === "" || key.length > 200)) return null;
  const role = r.role === undefined ? "character" : r.role;
  if (typeof role !== "string" || !(VOICE_ROLES as readonly string[]).includes(role)) return null;
  return { campaignId: r.campaignId, sessionId: r.sessionId, speakerId: r.speakerId, speakerName: r.speakerName, text: r.text, how, key, role: role as VoiceRole };
}

/** Whose voice says the line: the narrator's one voice, or a cast from the speaker's record. */
async function voiceFor(deps: TableVoiceDeps, session: VoiceSession, line: VoicedLine): Promise<VoiceRef> {
  const campaignId = session.campaign_id;
  if (line.role === "narrator") {
    // The table's choice, on Inworld; the ready-made voice of the same choice where this stack has no key for it.
    const voice = NARRATOR_VOICES[session.narrator_voice];
    return deps.hasService("inworld") ? { service: "inworld", id: voice.inworld } : { service: "elevenlabs", id: voice.fallback };
  }
  // Cast from the record when there is one; someone without a record is cast by their shown name alone.
  let traits: SpeakerTraits = { sex: null, age: null, voiceId: null };
  if (line.speaker.id !== null) {
    try {
      traits = line.role === "player" ? await deps.loadPlayerTraits(campaignId, line.speaker.id) : await deps.loadTraits(campaignId, line.speaker.id);
    } catch (error) {
      console.error("table-voice: reading the speaker's record failed:", error);
    }
  }
  // A voice the DM gave the character wins over the casting, where this stack can speak through its service; a
  // character whose own voice cannot be reached is cast like anyone else rather than left silent.
  const own = ownVoice(traits);
  if (own !== null && deps.hasService(own.service)) return own;
  return { service: "elevenlabs", id: pickVoice(line.speaker.id ?? line.speaker.name, traits).id };
}

export async function speakLine(input: {
  userId: string;
  body: unknown;
  deps: TableVoiceDeps;
}): Promise<{ ok: true; audio: string; mime: "audio/mpeg" } | { ok: false; refusal: VoiceRefusal }> {
  const { userId, deps } = input;
  const refuse = (status: number, error: string) => ({ ok: false as const, refusal: { status, error } });

  const body = parseVoiceBody(input.body);
  if (!body) return refuse(400, VOICE_MESSAGES.badBody);
  if (!deps.voiceOn()) return refuse(503, VOICE_MESSAGES.off);

  // Someone else's conversation, or one in another campaign, is "not found": a 403 would say it exists.
  const session = await deps.loadSession(body.sessionId);
  if (!session || session.user_id !== userId || session.campaign_id !== body.campaignId) return refuse(404, VOICE_MESSAGES.notFound);
  const campaign = await deps.loadCampaign(session.campaign_id);
  if (!campaign) return refuse(404, VOICE_MESSAGES.notFound);
  if (campaign.ai_enabled !== true) return refuse(403, VOICE_MESSAGES.aiOff);
  if (!(await deps.isDm(campaign, userId))) return refuse(403, VOICE_MESSAGES.forbidden);

  if (!(await deps.rateLimit(userId))) return refuse(429, VOICE_MESSAGES.rateLimited);

  const line: VoicedLine = { role: body.role, speaker: { id: body.speakerId, name: body.speakerName }, text: body.text, how: body.how };
  const at = { campaignId: session.campaign_id, sessionId: session.id };

  // A clip made before is answered as it was made. A store that cannot be read costs a new clip, never the line.
  try {
    const kept = await deps.loadClip(at, line);
    if (kept !== null) return { ok: true, audio: kept, mime: "audio/mpeg" };
  } catch (error) {
    console.error("table-voice: reading the kept clip failed:", error);
  }
  // Nothing kept: only a line this sitting showed is made. One that just arrived proves it with the key it came
  // with; one read back from a reopened sitting has no key, and is looked up in the conversation's own stored turns
  // (and spoken with the cue stored there, never one the page sends).
  if (body.key !== null) {
    if (!deps.keyFits(session.id, line, body.key)) return refuse(404, VOICE_MESSAGES.noLine);
  } else {
    const shown = await deps.findShown(session.id, line);
    if (shown === null) return refuse(404, VOICE_MESSAGES.noLine);
    line.how = shown.how;
  }

  // A line is voiced the moment it arrives, before its turn has been screened and kept, so it is screened here
  // too: a line the table may not tell is never spoken. An outage of the screen does not silence the table.
  try {
    if (await deps.isFlagged(line.text)) return refuse(422, VOICE_MESSAGES.unspeakable);
  } catch (error) {
    console.error("table-voice: screening the line failed:", error);
  }

  const voice = await voiceFor(deps, session, line);
  // A line that is made is paid for: what it costs is worked out before it is made, from the admin's numbers.
  // Without them nothing is made, because nothing could be charged.
  const rate = await deps.loadRate(voice.service);
  if (rate === null) return refuse(503, VOICE_MESSAGES.unpriced);
  const chars = speechChars(line.text, line.how);
  const credits = creditsForSpeech(chars, rate.usdPerMillionChars, rate.calibration);
  const held = await deps.reserve(userId, Math.max(1, Math.ceil(credits)));
  if (!held.ok) return refuse(held.status, held.error);
  try {
    // The words and the cue are the ones under the key: the page could not have changed either.
    const audio = await deps.synthesize(voice, { text: line.text, how: line.how, narration: line.role === "narrator" });
    // Kept before it is answered, but a clip that cannot be kept is still heard.
    await deps.keepClip(at, line, audio).catch((error) => console.error("table-voice: keeping the clip failed:", error));
    // Charged once it exists. A charge that fails is logged and the line is still heard: the player is never
    // made to pay twice by asking again, since the clip is kept.
    await deps.charge({ sessionId: session.id, userId }, credits, { service: voice.service, chars }).catch((error) => console.error("table-voice: charging the line failed:", error));
    return { ok: true, audio, mime: "audio/mpeg" };
  } catch (error) {
    // Out of allowance is told apart, so the page can say so once and stop asking for every line.
    if (error instanceof VoicesSpent) return refuse(402, VOICE_MESSAGES.spent);
    console.error("table-voice: the speech service failed:", error);
    return refuse(502, VOICE_MESSAGES.failed);
  } finally {
    await deps.release(held.ids).catch((error) => console.error("table-voice: releasing the held credits failed:", error));
  }
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Whether a conversation's stored turns hold this line: a character's spoken line by that speaker, the narrator's
 * text (a paragraph the player was shown, or a deed, which the narrator reads), or the player's own said line.
 * Answers the cue the line was stored with. Pure: the turns come in as they are read from `agent_turns`.
 */
export function shownInTurns(turns: ReadonlyArray<{ role: string; blocks: unknown }>, line: VoicedLine): { how: string | null } | null {
  const wanted = line.text.trim();
  for (const turn of turns) {
    if (!Array.isArray(turn.blocks)) continue;
    for (const block of turn.blocks) {
      if (!isRecord(block)) continue;
      if (block.type === "text" && turn.role === "user" && line.role === "player") {
        const player = block.player;
        if (isRecord(player) && player.kind === "say" && typeof player.text === "string" && player.text.trim() === wanted) return { how: null };
      } else if (block.type === "text" && turn.role === "assistant" && line.role === "narrator") {
        if (block.unshown !== true && typeof block.text === "string" && block.text.trim() === wanted) return { how: null };
      } else if (block.type === "tool_result" && Array.isArray(block.lines)) {
        for (const stored of block.lines) {
          if (!isRecord(stored) || typeof stored.text !== "string" || stored.text.trim() !== wanted) continue;
          if (stored.kind === "acted" && line.role === "narrator") return { how: null };
          const speaker = stored.speaker;
          if (stored.kind === "spoken" && line.role === "character" && isRecord(speaker) && speaker.id === line.speaker.id && speaker.name === line.speaker.name) {
            return { how: typeof stored.how === "string" && stored.how !== "" ? stored.how : null };
          }
        }
      }
    }
  }
  return null;
}

/**
 * What the voices cost, for the page to say before anyone sits down: credits for a minute of speech on each
 * service this stack speaks through. Null for a service that is not priced or not switched on.
 */
export async function voiceRates(deps: Pick<TableVoiceDeps, "voiceOn" | "hasService" | "loadRate">): Promise<{ on: boolean; perMinute: Record<VoiceService, number | null> }> {
  const perMinute: Record<VoiceService, number | null> = { elevenlabs: null, inworld: null };
  if (!deps.voiceOn()) return { on: false, perMinute };
  for (const service of ["elevenlabs", "inworld"] as const) {
    if (!deps.hasService(service)) continue;
    const rate = await deps.loadRate(service);
    if (rate !== null) perMinute[service] = creditsPerMinute(rate.usdPerMillionChars, rate.calibration);
  }
  return { on: true, perMinute };
}
