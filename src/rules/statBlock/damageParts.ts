/**
 * Reading damage expressions out of stat-block prose (#1017):
 * "5 (1d6 + 2) slashing damage plus 7 (2d6) poison damage", "1 piercing damage".
 */
import type { DamageType } from "../../types/damage.types.ts";
import type { DamagePart } from "../../types/statBlock.types.ts";
import { DAMAGE_TYPE_RE_SOURCE } from "./vocab.ts";

/** Non-capturing: the one capturing type group is the last one of a part. */
const TYPE = DAMAGE_TYPE_RE_SOURCE.replace("(", "(?:");
const DICE = "\\d*d\\d+(?:\\s*[+-]\\s*\\d+)?";

/** "7 (2d6 + 3) type? damage?", "2d6+3 type", or a flat "1 type? damage". */
const TYPE_OR_DAMAGE = `(?=\\s+(?:(?:magical|nonmagical|non-magical)\\s+)?(?:${TYPE}|damage)\\b)`;
const PART_SOURCE =
  `(?:(?<!\\d)\\d+\\s*\\(\\s*(${DICE})\\s*\\)${TYPE_OR_DAMAGE}|(?<![\\w(])(${DICE})(?!\\d)${TYPE_OR_DAMAGE}|(?<![\\d.])(\\d+)(?=\\s+(?:${TYPE}\\s+)?damage\\b))` +
  `(?:\\s+(?:(?:magical|nonmagical|non-magical)\\s+)?${DAMAGE_TYPE_RE_SOURCE}\\b)?(?:\\s+damage\\b)?`;

export interface DamageRead {
  parts: DamagePart[];
  /** Index of the first part. */
  start: number;
  /** Index just past the last part read. */
  end: number;
  /** A part's type is a choice ("necrotic or radiant"), which one DamagePart cannot say. */
  choice: boolean;
}

/** Sentence boundary: ". " before a capital, but not after "ft." */
export const SENTENCE_BREAK = /(?<!\bft)\.\s+(?=[A-Z])/g;

/** End index of the sentence that contains `from`. */
export function sentenceEnd(text: string, from: number): number {
  SENTENCE_BREAK.lastIndex = from;
  const m = SENTENCE_BREAK.exec(text);
  return m ? m.index + 1 : text.length;
}

function partFrom(m: RegExpExecArray): DamagePart {
  const dice = m[1] ?? m[2] ?? m[3];
  const type = m[4] === undefined ? null : (m[4].toLowerCase() as DamageType);
  return { dice: dice.replace(/\s+/g, ""), type };
}

/**
 * Read a damage roll starting at the first expression in `text[from, limit)`,
 * then any riders joined by "plus" / "and" / "+". A rider followed by a
 * condition ("... damage if the target ...") is left out, as is a versatile
 * ", or 6 (1d8 + 2) ... if used with two hands" alternative.
 */
export function readDamage(text: string, from: number, limit: number): DamageRead | null {
  const window = text.slice(0, limit);
  const first = new RegExp(PART_SOURCE, "gi");
  first.lastIndex = from;
  const m = first.exec(window);
  if (!m) return null;
  const parts = [partFrom(m)];
  let end = m.index + m[0].length;
  const choiceAt = new RegExp(`^\\s*,?\\s+or\\s+(?:magical\\s+)?${TYPE}\\b`, "i");
  let choice = choiceAt.test(window.slice(end));

  const rider = new RegExp(`\\s*,?\\s*(?:plus|and|\\+)\\s+${PART_SOURCE}`, "iy");
  for (;;) {
    rider.lastIndex = end;
    const r = rider.exec(window);
    if (!r) break;
    const after = window.slice(r.index + r[0].length);
    if (/^\s+(?:if|when|while|against|on a|whenever|as long)\b/i.test(after)) break;
    parts.push(partFrom(r));
    end = r.index + r[0].length;
    if (choiceAt.test(window.slice(end))) choice = true;
  }
  return { parts, start: m.index, end, choice };
}
