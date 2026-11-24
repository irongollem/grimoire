// What a character's record says about how it should sound (#1021, #1272): sex from its pronouns, age from its
// age field. The casting itself, from the voice registry, is `casting.ts`; this file reads the record and holds
// what is said aloud and how the line is written for each speech service.
//
// Pure: no I/O.

export type Sex = "woman" | "man";
export type AgeBand = "child" | "young" | "adult" | "old";

/**
 * Whether a character's own record reads as a woman or a man, from the pronouns in it. Null when it does not say or
 * says both about equally: then the voice is cast from everyone, since guessing wrong is worse than a neutral cast.
 */
export function sexOf(text: string): Sex | null {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  let she = 0;
  let he = 0;
  for (const w of words) {
    if (w === "she" || w === "her" || w === "hers" || w === "herself") she++;
    else if (w === "he" || w === "him" || w === "his" || w === "himself") he++;
  }
  if (she === 0 && he === 0) return null;
  // A clear lead: a record about a woman still mentions "his" now and then (a father, a master).
  if (she >= he * 2) return "woman";
  if (he >= she * 2) return "man";
  return null;
}

/** A sheet's gender field ("Female", "woman", "Male", "m") as a cast; null for anything else, which is cast from everyone. */
export function sexFromGender(gender: string): Sex | null {
  const g = gender.trim().toLowerCase();
  if (/^(f|female|woman|girl|she)$/.test(g)) return "woman";
  if (/^(m|male|man|boy|he)$/.test(g)) return "man";
  return null;
}

/**
 * Roughly how old a character sounds, from the free text of its age ("~55 Pours", "late 70s", "ancient"). The first
 * number in it decides; a word decides when there is none. Null when it says nothing usable.
 */
export function ageOf(text: string): AgeBand | null {
  const t = text.toLowerCase();
  const n = /(\d{1,4})/.exec(t);
  if (n) {
    const years = Number(n[1]);
    // A number under 13 is a child; "young" stays 13 to 29.
    if (years < 13) return "child";
    if (years < 30) return "young";
    if (years < 60) return "adult";
    return "old";
  }
  if (/\b(child|boy|girl|kid|little(?! old))/.test(t)) return "child";
  if (/\b(young|youth|teen)/.test(t)) return "young";
  if (/\b(old|elder|ancient|aged|venerable|generations)/.test(t)) return "old";
  if (/\b(adult|middle)/.test(t)) return "adult";
  return null;
}

// The Narrator's voices live with the speech module's neighbours, since a note is read aloud in them too.
export { isNarratorVoice, NARRATOR_CUE, narratorSpeaker, type NarratorVoice } from "../_shared/narratorVoice.ts";

/** The longest narration sent to be spoken: a narrator's reply is a few sentences, sometimes a full paragraph. */
export const NARRATION_MAX_CHARS = 1500;

/** The longest line sent to be spoken. A spoken line is one to three sentences; more than this is not one. */
export const SPEECH_MAX_CHARS = 600;

/**
 * The text a voice is given: the delivery cue as a short tag in front of the words, the way the speech model reads
 * one. The cue is already plain words (`deliveryCue`); brackets inside the words themselves are taken out, so a
 * line cannot carry an instruction of its own.
 */
export function speechText(text: string, how: string | null, max: number = SPEECH_MAX_CHARS): string {
  const words = text.replace(/[[\]<>*_]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return how === null || how === "" ? words : `[${how}] ${words}`;
}

/**
 * The same line for Inworld, which takes the manner as an instruction in front of the words ("[say it furious,
 * shouting]") where ElevenLabs takes a bare tag. The cue and the words are cleaned the same way.
 */
export function inworldText(text: string, how: string | null, max: number = SPEECH_MAX_CHARS): string {
  const words = speechText(text, null, max);
  return how === null || how === "" ? words : `[say it ${how}] ${words}`;
}
