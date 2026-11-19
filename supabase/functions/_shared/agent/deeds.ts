// A deed is something new a character does (#1021).
//
// Each character answers from a call of its own, and every answer may carry one sentence of what the character
// visibly does. Asked again a moment later, a character tends to restate the posture it is already in. Seen live
// (18 Nov 2026): told "keep your hands close, dear", a child answered three turns running with "He keeps his hands
// close to his chest and watches the key", "He watches the key without moving his hands from his chest" and the
// like, and the page read as a stuck record. A posture someone already holds is not a deed, so it is not told again.

/** Words that carry no deed: pronouns, articles, joining words, and the verbs of merely going on. */
const EMPTY = new Set([
  "a", "an", "the", "and", "or", "but", "then", "while", "as", "to", "of", "in", "on", "at", "by", "for", "from", "with", "without", "into", "over", "toward", "towards",
  "he", "she", "they", "it", "his", "her", "hers", "their", "its", "him", "them", "this", "that",
  "is", "are", "be", "still", "again", "keeps", "keep", "keeping", "stays", "stay", "remains", "remain", "continues", "continue", "goes", "holds", "hold",
  "not", "no", "any", "moving", "quietly", "carefully", "just", "only",
]);

function words(deed: string): Set<string> {
  return new Set(deed.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !EMPTY.has(w)));
}

/** How much of two deeds is the same doing: the share of their telling words they have in common, from 0 to 1. */
export function deedOverlap(a: string, b: string): number {
  const one = words(a);
  const two = words(b);
  if (one.size === 0 || two.size === 0) return 0;
  let shared = 0;
  for (const word of one) if (two.has(word)) shared += 1;
  return shared / (one.size + two.size - shared);
}

/** At or over this, a deed is the same doing told again. */
export const SAME_DEED = 0.5;
/** A posture is compared with the character's last few deeds: something done long ago may honestly be done again. */
export const DEEDS_REMEMBERED = 4;

/** The deed when it is something new for this character, or null when it only repeats one of their last few. */
export function freshDeed(deed: string | null, earlier: readonly string[]): string | null {
  if (deed === null) return null;
  return earlier.slice(-DEEDS_REMEMBERED).some((past) => deedOverlap(deed, past) >= SAME_DEED) ? null : deed;
}
