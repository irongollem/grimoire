// The Narrator's voices (#1021 row 21): what the AI table narrates in and what a note is read aloud in.

/** The two voices a table may give its Narrator (`agent_sessions.narrator_voice`). */
export type NarratorVoice = "male" | "female";

export function isNarratorVoice(raw: unknown): raw is NarratorVoice {
  return raw === "male" || raw === "female";
}

/**
 * The Narrator's voices. Each choice has a voice on both services.
 *
 * The man's is "Narrator", the maintainer's own design on ElevenLabs (24 Nov 2026). It replaced David
 * (`BNgbHR0DNeZixGQVzloa`), chosen by ear on 19 Nov 2026 but a premium voice at more than twice the price per
 * character; do not put David back without weighing that price. So the man narrates on ElevenLabs, at the
 * table and for a note told with feeling; his Inworld voice (the maintainer's own design, 18 Nov 2026) is the
 * cheaper plain telling of a note, and the stand-in where a stack has no ElevenLabs key. The woman's is the
 * maintainer's Inworld design, with Alice, an ElevenLabs ready-made voice, for a telling with feeling and as the
 * stand-in. `table` says which service narrates a sitting. A voice id names a voice; it is not a secret.
 */
export const NARRATOR_VOICES: Record<NarratorVoice, { elevenlabs: string; inworld: string; table: "elevenlabs" | "inworld" }> = {
  male: { elevenlabs: "uT0AExtVkYtYQMNBHqmV", inworld: "snappy-magpie-0676__design-voice-970db65e", table: "elevenlabs" },
  female: { elevenlabs: "Xb7hH8MSUJpSbSDYk0k2", inworld: "snappy-magpie-0676__design-voice-1e599405", table: "inworld" },
};

/** The manner the Narrator tells in on ElevenLabs, which acts on a cue (the maintainer: "significantly better"). */
export const NARRATOR_CUE = "an old storyteller by the fire, warm and unhurried";

/** Who narrates: the choice's own service where this stack has its key, else the same choice on the other. */
export function narratorSpeaker(voice: NarratorVoice, hasService: (service: "elevenlabs" | "inworld") => boolean): { service: "elevenlabs" | "inworld"; id: string } {
  const v = NARRATOR_VOICES[voice];
  const other = v.table === "elevenlabs" ? "inworld" : "elevenlabs";
  const service = hasService(v.table) ? v.table : other;
  return { service, id: v[service] };
}

/**
 * Oolu, the owl in the Familiar box (Ask Grimoire): a voice the maintainer designed on ElevenLabs (24 Nov 2026).
 * ElevenLabs only: there is no Inworld stand-in, so a stack without that key leaves Oolu silent.
 */
export const FAMILIAR_VOICE = { service: "elevenlabs", id: "kGl89T0PY344jeMOzVyf" } as const;
