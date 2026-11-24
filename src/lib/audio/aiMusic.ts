// The request shape is the edge function's own, imported rather than duplicated (pure TS, no Deno-specific
// imports, like several other _shared modules imported from browser code).
export type { MusicRequest as FallbackPromptRequest } from "@edge-shared/musicPrompt.ts";

/** Selectable target lengths for a generated track. Lyria 3.5 is one model —
 * length is steered by the prompt (a target duration plus a timestamped
 * timeline), not by picking a different model. */
export const MUSIC_LENGTHS = [
  { seconds: 60, label: "1 min" },
  { seconds: 120, label: "2 min" },
  { seconds: 180, label: "3 min" },
] as const;

export type MusicLengthSeconds = (typeof MUSIC_LENGTHS)[number]["seconds"];

/** `choir` is a wordless choir — the voice epic fantasy scoring reaches for
 * most, and one neither "instrumental" (no voices) nor "vocals" (a singer
 * with lyrics) can ask for. */
export type MusicVocals = "instrumental" | "choir" | "vocals";

/** The single credit-cost / pricing-category generation type for music, now
 * that one model (Lyria 3.5) serves every length. */
export const MUSIC_GENERATION_TYPE = "music_track";

/** Maximum lyrics length in characters (keeps generated audio within ~3 min, ~400 words). */
export const LYRICS_MAX_CHARS = 2200;

/** Lyria's Interactions API accepts at most 10 images per request. */
export const MUSIC_MAX_IMAGES = 10;
