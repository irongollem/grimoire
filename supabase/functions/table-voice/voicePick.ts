// Which ready-made voice speaks for a character at the AI table (#1021), until each character has a voice of its own.
//
// The maintainer compared two speech services by ear on 17 Nov 2026 and chose ElevenLabs for what characters say
// ("sounds more human"; it whispered when told to, and its anger sounded like anger). Designing a voice per
// character needs a paid plan there, so this first version casts from the account's ready-made voices: by whether
// the character reads as a woman or a man, and roughly how old, and then always the same voice for the same
// character, so a person does not change voice between lines.
//
// Pure: no I/O.

export type Sex = "woman" | "man";
export type AgeBand = "young" | "adult" | "old";

export interface StockVoice {
  id: string;
  name: string;
  sex: Sex;
  age: AgeBand;
}

// ElevenLabs' premade voices, as listed for the account on 17 Nov 2026 (name, gender and age labels are theirs).
// None is a child and none an elderly woman: the oldest-sounding of each sex stands in.
export const STOCK_VOICES: readonly StockVoice[] = [
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", sex: "woman", age: "young" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", sex: "woman", age: "young" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", sex: "woman", age: "young" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", sex: "woman", age: "adult" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", sex: "woman", age: "adult" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", sex: "woman", age: "adult" },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", sex: "woman", age: "old" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will", sex: "man", age: "young" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", sex: "man", age: "young" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", sex: "man", age: "young" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", sex: "man", age: "adult" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", sex: "man", age: "adult" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", sex: "man", age: "adult" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", sex: "man", age: "adult" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", sex: "man", age: "old" },
];

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
    if (years < 30) return "young";
    if (years < 60) return "adult";
    return "old";
  }
  if (/\b(child|young|youth|girl|boy|teen)/.test(t)) return "young";
  if (/\b(old|elder|ancient|aged|venerable|generations)/.test(t)) return "old";
  if (/\b(adult|middle)/.test(t)) return "adult";
  return null;
}

/** A small stable number from a character's key (FNV-1a), so the same character is always cast the same. */
function hashOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The voice for a character. Narrowed by sex when known, then by age when that still leaves someone, and chosen
 * among what is left by the character's key, so two young women in a scene are likely to sound different and each
 * keeps their voice. `key` is the record's id, or the shown name for someone with no record.
 */
export function pickVoice(key: string, traits: { sex: Sex | null; age: AgeBand | null }, voices: readonly StockVoice[] = STOCK_VOICES): StockVoice {
  const bySex = traits.sex === null ? voices : voices.filter((v) => v.sex === traits.sex);
  const pool = bySex.length > 0 ? bySex : voices;
  const byAge = traits.age === null ? pool : pool.filter((v) => v.age === traits.age);
  const cast = byAge.length > 0 ? byAge : pool;
  return cast[hashOf(key) % cast.length];
}

// The Narrator's voices live with the speech module's neighbours, since a note is read aloud in them too.
export { isNarratorVoice, NARRATOR_VOICES, type NarratorVoice } from "../_shared/narratorVoice.ts";

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
