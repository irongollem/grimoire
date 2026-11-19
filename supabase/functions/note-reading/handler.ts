// A note read aloud (#1021 row 19). No Deno and no Supabase in here; everything with I/O comes in through
// `NoteReadingDeps`, so the rules are tested against an in-memory store and `index.ts` only wires real ones.
//
// Three things a caller may ask:
//   estimate  the Dungeon Master asks what a reading would cost before making it;
//   make      the Dungeon Master has the note spoken, once, and pays for it;
//   listen    anyone who may read the note hears the recording, at no cost.
//
// What is spoken is the text a player may read (`note_text_for_reading`): the players hear it, so a Dungeon
// Master's secret passage must never be in it. The recording is found by a key derived from the campaign, the note
// and the hash of what was spoken; nothing a client can write decides where it is read from.

import { creditsForSpeech } from "../_shared/agent/voiceCost.ts";
import type { CreditCalibration } from "../_shared/agent/metering.ts";
import { isNarratorVoice, NARRATOR_VOICES, type NarratorVoice } from "../_shared/narratorVoice.ts";
import { joinAudio, noteSpeechText, READING_MAX_CHARS, READING_PARALLEL, readingHash, readingKey, speechPieces } from "../_shared/noteReading.ts";
import type { SpeechService } from "../_shared/speech.ts";

export interface ReadingNote {
  id: string;
  campaign_id: string | null;
  reading_hash: string | null;
  reading_voice: NarratorVoice | null;
}

export interface ReadingCampaign {
  id: string;
  user_id: string;
  ai_enabled: boolean | null;
}

type Reservation = { ok: true; ids: string[] } | { ok: false; status: number; error: string };

export interface NoteReadingDeps {
  /** Whether this stack speaks at all (its speech key and switch are set). */
  voiceOn(): boolean;
  /** By id alone: the handler decides what the caller may do with it. */
  loadNote(noteId: string): Promise<ReadingNote | null>;
  loadCampaign(campaignId: string): Promise<ReadingCampaign | null>;
  /** The owner or a co-DM. */
  isDm(campaign: ReadingCampaign, userId: string): Promise<boolean>;
  /** Whether the caller may read this note, asked as the caller: their own, their campaign's as its DM, or one shared with them as a player. */
  mayRead(campaignId: string, noteId: string): Promise<boolean>;
  /** The note's text as a player may read it, the Dungeon Master's secret passages withheld; null when it cannot be checked. */
  playerText(noteId: string): Promise<string | null>;
  hasService(service: SpeechService): boolean;
  loadRate(service: SpeechService): Promise<{ usdPerMillionChars: number; calibration: CreditCalibration } | null>;
  /** The same screen every text sent to a model goes through. */
  isFlagged(text: string): Promise<boolean>;
  reserve(userId: string, credits: number): Promise<Reservation>;
  release(ids: string[]): Promise<void>;
  charge(userId: string, credits: number, log: { service: SpeechService }): Promise<void>;
  synthesize(voice: { service: SpeechService; id: string }, text: string): Promise<Uint8Array>;
  loadAudio(key: string): Promise<Uint8Array | null>;
  keepAudio(key: string, audio: Uint8Array): Promise<void>;
  /** Says on the note that it has a reading. Only the server can. */
  setReading(noteId: string, reading: { hash: string; voice: NarratorVoice; chars: number }): Promise<void>;
}

export const READING_MESSAGES = {
  badBody: "The request is not valid.",
  off: "Voices are not switched on.",
  notFound: "That note was not found.",
  aiOff: "AI is disabled for this campaign.",
  notDm: "Only the Dungeon Master has a note read aloud.",
  empty: "There is nothing in this note to read aloud.",
  tooLong: "This note is too long to read aloud in one go. Split it, or shorten it.",
  unchecked: "This note's text could not be checked, so it is not read aloud.",
  flagged: "This note holds something that may not be sent to be spoken.",
  noPrice: "Reading aloud has no price set, so it cannot be charged.",
  noReading: "This note has not been read aloud yet.",
} as const;

export interface ReadingBody {
  action: "estimate" | "make" | "listen";
  noteId: string;
  voice: NarratorVoice;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReadingBody(raw: unknown): ReadingBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.action !== "estimate" && r.action !== "make" && r.action !== "listen") return null;
  if (typeof r.noteId !== "string" || !UUID_RE.test(r.noteId)) return null;
  const voice = r.voice === undefined ? "male" : r.voice;
  if (!isNarratorVoice(voice)) return null;
  return { action: r.action, noteId: r.noteId, voice };
}

export type ReadingOutcome =
  | { ok: false; status: number; error: string }
  | { ok: true; kind: "estimate"; chars: number; credits: number; has: boolean }
  | { ok: true; kind: "made"; chars: number; credits: number }
  | { ok: true; kind: "audio"; audio: Uint8Array };

const refuse = (status: number, error: string): ReadingOutcome => ({ ok: false, status, error });

/** The voice a reading is spoken in: the Narrator's on Inworld, or its ready-made stand-in where the stack has no key for that. */
function voiceOf(deps: NoteReadingDeps, voice: NarratorVoice): { service: SpeechService; id: string } {
  const v = NARRATOR_VOICES[voice];
  return deps.hasService("inworld") ? { service: "inworld", id: v.inworld } : { service: "elevenlabs", id: v.fallback };
}

export async function readNote(input: { userId: string; body: unknown; deps: NoteReadingDeps }): Promise<ReadingOutcome> {
  const { userId, deps } = input;
  const body = parseReadingBody(input.body);
  if (!body) return refuse(400, READING_MESSAGES.badBody);

  const note = await deps.loadNote(body.noteId);
  // A note outside a campaign has no players to hear it and no campaign to say AI is on: nothing is read.
  if (!note || note.campaign_id === null) return refuse(404, READING_MESSAGES.notFound);
  // Someone who may not read the note is told it does not exist: a 403 would say it does.
  if (!(await deps.mayRead(note.campaign_id, note.id))) return refuse(404, READING_MESSAGES.notFound);

  if (body.action === "listen") {
    if (note.reading_hash === null) return refuse(404, READING_MESSAGES.noReading);
    const audio = await deps.loadAudio(readingKey({ campaignId: note.campaign_id, noteId: note.id, hash: note.reading_hash }));
    return audio === null ? refuse(404, READING_MESSAGES.noReading) : { ok: true, kind: "audio", audio };
  }

  // Making a reading, and asking what one costs, is the Dungeon Master's.
  if (!deps.voiceOn()) return refuse(503, READING_MESSAGES.off);
  const campaign = await deps.loadCampaign(note.campaign_id);
  if (!campaign) return refuse(404, READING_MESSAGES.notFound);
  if (!(await deps.isDm(campaign, userId))) return refuse(403, READING_MESSAGES.notDm);
  if (campaign.ai_enabled === false) return refuse(403, READING_MESSAGES.aiOff);

  const stored = await deps.playerText(note.id);
  if (stored === null) return refuse(422, READING_MESSAGES.unchecked);
  const text = noteSpeechText(stored);
  if (text === "") return refuse(422, READING_MESSAGES.empty);
  if (text.length > READING_MAX_CHARS) return refuse(422, READING_MESSAGES.tooLong);

  const voice = voiceOf(deps, body.voice);
  const rate = await deps.loadRate(voice.service);
  if (rate === null) return refuse(503, READING_MESSAGES.noPrice);
  // Whole credits, rounded up: a reading is one charge, not a running total like a sitting's lines.
  const credits = Math.max(1, Math.ceil(creditsForSpeech(text.length, rate.usdPerMillionChars, rate.calibration)));
  const hash = await readingHash(text, body.voice);
  const key = readingKey({ campaignId: note.campaign_id, noteId: note.id, hash });

  if (body.action === "estimate") {
    return { ok: true, kind: "estimate", chars: text.length, credits, has: note.reading_hash === hash };
  }

  // This very text in this voice was already spoken (a retry after the row could not be written): nothing is made
  // or charged twice.
  if ((await deps.loadAudio(key)) !== null) {
    await deps.setReading(note.id, { hash, voice: body.voice, chars: text.length });
    return { ok: true, kind: "made", chars: text.length, credits: 0 };
  }

  if (await deps.isFlagged(text)) return refuse(422, READING_MESSAGES.flagged);
  const reservation = await deps.reserve(userId, credits);
  if (!reservation.ok) return refuse(reservation.status, reservation.error);
  try {
    const pieces = speechPieces(text);
    const spoken: Uint8Array[] = [];
    for (let i = 0; i < pieces.length; i += READING_PARALLEL) {
      const batch = pieces.slice(i, i + READING_PARALLEL);
      const made = await Promise.all(batch.map((piece) => deps.synthesize(voice, piece)));
      // Batches are awaited in turn and each keeps its own order, so the pieces stay in reading order.
      spoken.push(...made);
    }
    await deps.keepAudio(key, joinAudio(spoken));
    await deps.setReading(note.id, { hash, voice: body.voice, chars: text.length });
    // Charged last: a reading that could not be kept or put on the note is not paid for.
    await deps.charge(userId, credits, { service: voice.service });
    return { ok: true, kind: "made", chars: text.length, credits };
  } finally {
    await deps.release(reservation.ids);
  }
}
