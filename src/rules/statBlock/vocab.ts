/**
 * Word lists shared by the stat-block parser and checker (#1017).
 * Relative `.ts` imports only: edge functions import this folder.
 */
import { DAMAGE_TYPES } from "../../types/damage.types.ts";
import type { SaveAbility, SrdConditionName } from "../../types/statBlock.types.ts";

export const ABILITY_NAMES: Record<SaveAbility, string> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

/** Matches an ability by full name or three-letter abbreviation, capturing it. */
export const ABILITY_RE_SOURCE =
  "(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)";

export function abilityFromWord(word: string): SaveAbility | null {
  const w = word.toLowerCase().slice(0, 3);
  switch (w) {
    case "str":
    case "dex":
    case "con":
    case "int":
    case "wis":
    case "cha":
      return w;
    default:
      return null;
  }
}

export const DAMAGE_TYPE_RE_SOURCE = `(${DAMAGE_TYPES.join("|")})`;

/** One stem per SRD condition, so "poisoned", "Poisoned" and "poison" all match. */
export const CONDITION_STEMS: Record<SrdConditionName, RegExp> = {
  Blinded: /\bblind/i,
  Charmed: /\bcharm/i,
  Deafened: /\bdeaf/i,
  Exhaustion: /\bexhaust|\bfatigue/i,
  Frightened: /\bfrighten/i,
  Grappled: /\bgrappl/i,
  Incapacitated: /\bincapacitat/i,
  Invisible: /\binvisib/i,
  Paralyzed: /\bparaly[zs]/i,
  Petrified: /\bpetrif/i,
  Poisoned: /\bpoison/i,
  Prone: /\bprone\b/i,
  Restrained: /\brestrain/i,
  Stunned: /\bstun/i,
  Unconscious: /\bunconscious/i,
};

export const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  a: 1,
  an: 1,
  once: 1,
  two: 2,
  twice: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** A printed name without its trailing parentheticals: "Fire Breath (Recharge 5-6)" -> "Fire Breath". */
export function baseName(name: string): string {
  return name.replace(/(?:\s*\([^)]*\))+\s*$/, "").trim();
}
