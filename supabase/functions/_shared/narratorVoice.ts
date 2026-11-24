// The Narrator's voices (#1021 row 21): what the AI table narrates in and what a note is read aloud in.

import type { SupabaseClient } from "@supabase/supabase-js";

/** The two voices a table may give its Narrator (`agent_sessions.narrator_voice`). */
export type NarratorVoice = "male" | "female";

export function isNarratorVoice(raw: unknown): raw is NarratorVoice {
  return raw === "male" || raw === "female";
}

export type NarratorService = "elevenlabs" | "inworld";

/**
 * The app's own voices are rows of the voice registry (`speech_voices.binding`), not constants: the maintainer swaps
 * one by refilling its slot on the Voices page, and a bound slot is never removed. The man narrates the table on
 * ElevenLabs (and a note told with feeling), his Inworld voice is the cheaper plain telling of a note and the
 * stand-in without an ElevenLabs key; the woman narrates on Inworld, with her ElevenLabs voice for a telling with
 * feeling and as her stand-in. Ooru (`familiar`) is ElevenLabs only, with no stand-in. A voice id names a voice;
 * it is not a secret.
 */
export const APP_BINDINGS = ["narrator-man-elevenlabs", "narrator-man-inworld", "narrator-woman-inworld", "narrator-woman-elevenlabs", "familiar"] as const;
export type AppBinding = (typeof APP_BINDINGS)[number];

export interface AppVoice {
  service: NarratorService;
  id: string;
}

/** Each binding's voice; null when its slot is not filled yet (or the row is gone). */
export type AppVoices = Record<AppBinding, AppVoice | null>;

export const NO_APP_VOICES: AppVoices = Object.fromEntries(APP_BINDINGS.map((b) => [b, null])) as AppVoices;

/** The service a table's Narrator speaks on, per choice: the man on ElevenLabs, the woman on Inworld. */
const TABLE_SERVICE: Record<NarratorVoice, NarratorService> = { male: "elevenlabs", female: "inworld" };

const bindingOf = (voice: NarratorVoice, service: NarratorService): AppBinding => `narrator-${voice === "male" ? "man" : "woman"}-${service}`;

/** Reads the bound slots with the service role: they are `own` slots, which an ordinary caller's policy hides. */
export async function loadAppVoices(admin: SupabaseClient): Promise<AppVoices> {
  const { data, error } = await admin.from("speech_voices").select("binding, service, voice_id").not("binding", "is", null);
  if (error) throw error;
  const voices: AppVoices = { ...NO_APP_VOICES };
  for (const row of (data ?? []) as Array<{ binding: string; service: string | null; voice_id: string | null }>) {
    if (!(APP_BINDINGS as readonly string[]).includes(row.binding)) continue;
    if ((row.service !== "elevenlabs" && row.service !== "inworld") || typeof row.voice_id !== "string" || row.voice_id === "") continue;
    voices[row.binding as AppBinding] = { service: row.service, id: row.voice_id };
  }
  return voices;
}

/** The manner the Narrator tells in on ElevenLabs, which acts on a cue (the maintainer: "significantly better"). */
export const NARRATOR_CUE = "an old storyteller by the fire, warm and unhurried";

/**
 * Who narrates: the choice's own service where this stack has its key and its slot is filled, else the same choice
 * on the other service. Null when neither can speak.
 */
export function narratorSpeaker(voice: NarratorVoice, hasService: (service: NarratorService) => boolean, app: AppVoices): AppVoice | null {
  const own = TABLE_SERVICE[voice];
  const other: NarratorService = own === "elevenlabs" ? "inworld" : "elevenlabs";
  return firstSpeakable([own, other].map((s) => app[bindingOf(voice, s)]), hasService);
}

/** The first of these voices this stack can speak through, in order; null when none. */
export function firstSpeakable(voices: ReadonlyArray<AppVoice | null>, hasService: (service: NarratorService) => boolean): AppVoice | null {
  return voices.find((v): v is AppVoice => v !== null && hasService(v.service)) ?? null;
}

/** The Narrator's voice of this choice on this service, for a note's telling; null when the slot is not filled. */
export function narratorOn(voice: NarratorVoice, service: NarratorService, app: AppVoices): AppVoice | null {
  return app[bindingOf(voice, service)];
}

/** Ooru, the owl in the Familiar box: ElevenLabs only, no stand-in. Null when the slot is not filled. */
export function familiarVoice(app: AppVoices): AppVoice | null {
  return app.familiar;
}
