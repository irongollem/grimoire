// The Narrator's voices (#1021 row 21): what the AI table narrates in and what a note is read aloud in.

/** The two voices a table may give its Narrator (`agent_sessions.narrator_voice`). */
export type NarratorVoice = "male" | "female";

export function isNarratorVoice(raw: unknown): raw is NarratorVoice {
  return raw === "male" || raw === "female";
}

/**
 * The Narrator's voices. Both were designed on Inworld by the maintainer (18 Nov 2026): narration asks the least
 * acting, so it runs on the cheaper service. `fallback` is the ElevenLabs ready-made voice that speaks when this
 * stack cannot reach Inworld (no key), so a table is never silent for it: George and Alice, both adult and steady.
 * A voice id names a voice; it is not a secret.
 */
export const NARRATOR_VOICES: Record<NarratorVoice, { inworld: string; fallback: string }> = {
  male: { inworld: "snappy-magpie-0676__design-voice-970db65e", fallback: "JBFqnCBsd6RMkjVDRZzb" },
  female: { inworld: "snappy-magpie-0676__design-voice-1e599405", fallback: "Xb7hH8MSUJpSbSDYk0k2" },
};
