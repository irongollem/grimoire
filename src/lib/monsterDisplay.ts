/**
 * Shared monster display helpers.
 *
 * `crColor` maps a challenge rating to a threat-tier colour, used by the
 * Bestiary list cards (MonsterList.vue), the mobile detail hero CR pill
 * (MonsterSheetMobile.vue), the form-card strip and the player bestiary.
 * Extracted here so the single source of truth is reused rather than
 * duplicated.
 *
 * Every entry point takes a POSSIBLY-ABSENT rating. `stat_block` is jsonb, so
 * `challenge_rating` is a key that can simply not be there — an AI generation
 * the model left it out of, an import that never had it. The TypeScript type
 * says `string` and is wrong about that; until it is made honest (27 unguarded
 * reads, tracked separately) these helpers are the boundary that has to cope.
 *
 * They cope by admitting they do not know, rather than substituting a value.
 * A monster with no rating is not CR 0: colouring it green tells the DM at a
 * glance that the thing is harmless, which is a worse failure than saying
 * nothing. Hence a neutral swatch and a "???" label.
 */

/** As stored, not as typed: the key may be absent, null or blank. */
export type ChallengeRating = string | null | undefined;

/** Neutral swatch for a rating we do not have — deliberately not on the
 *  green→purple threat scale, so it cannot be misread as a tier. */
const UNKNOWN_CR_COLOR = "#6b7280";

/** Shown in place of a missing rating. The project's marker for "we do not
 *  know", used instead of a blank that reads as a rendering bug or a 0 that
 *  reads as a fact. */
export const UNKNOWN_CR_LABEL = "???";

function parseFraction(s: string): number {
  const [a, b] = s.split("/");
  return parseFloat(a) / parseFloat(b);
}

/**
 * Numeric value of a challenge-rating string ("1/4" → 0.25, "5" → 5), or null
 * when there is nothing usable to convert.
 *
 * Null rather than a fallback number so callers have to decide what an unknown
 * rating means for them — sorting, colouring and XP budgeting do not want the
 * same answer, and a shared default would quietly be wrong for two of them.
 *
 * Deliberately NOT the same function as `parseCr` in lib/utils, which answers
 * the same question with 0 and is used for sorting and wildshape eligibility.
 * Zero is right there (an unknown rating has to sort somewhere, and first is as
 * good as anywhere) and wrong here: it would paint an unrated monster the same
 * green as a CR 0 critter, telling the DM at a glance that it is harmless.
 * If you are tempted to merge them, that difference is the reason not to.
 */
export function crToNumber(cr: ChallengeRating): number | null {
  if (cr === null || cr === undefined) return null;
  const trimmed = cr.trim();
  if (trimmed === "") return null;
  if (trimmed === "0") return 0;
  const value = trimmed.includes("/") ? parseFraction(trimmed) : parseFloat(trimmed);
  // Covers "?", "Unknown", "1/0" and anything else non-numeric that has found
  // its way into the jsonb over the years.
  return Number.isFinite(value) ? value : null;
}

/** Threat-tier colour for a challenge rating. */
export function crColor(cr: ChallengeRating): string {
  const num = crToNumber(cr);
  if (num === null) return UNKNOWN_CR_COLOR;
  if (num <= 0.5) return "#22c55e";
  if (num <= 4) return "#eab308";
  if (num <= 9) return "#f97316";
  if (num <= 15) return "#dc2626";
  return "#7c3aed";
}

/** The rating as displayed — the stored text, or the unknown marker. */
export function crText(cr: ChallengeRating): string {
  const trimmed = cr?.trim();
  return trimmed ? trimmed : UNKNOWN_CR_LABEL;
}

/** "CR 5" / "CR ???" — the badge label used across the bestiary surfaces. */
export function crLabel(cr: ChallengeRating): string {
  return `CR ${crText(cr)}`;
}
