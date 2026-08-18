/**
 * Shared monster display helpers.
 *
 * `crTier` maps a challenge rating to a named threat tier, and `crBg`/`crVar`
 * turn that into the theme token for it — used by the
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
const UNKNOWN_CR_TIER = "unknown" as const;

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

/**
 * Which step of the threat ramp a challenge rating falls on.
 *
 * The tier is named rather than coloured, so the thresholds live in one place
 * and the palette lives in `theme.css`. Previously this returned hex, which put
 * a colour decision inside a rules function and meant the ramp could not follow
 * the theme (#742).
 */
export type CrTier = "unknown" | "trivial" | "low" | "moderate" | "high" | "deadly";

export function crTier(cr: ChallengeRating): CrTier {
  const num = crToNumber(cr);
  if (num === null) return UNKNOWN_CR_TIER;
  if (num <= 0.5) return "trivial";
  if (num <= 4) return "low";
  if (num <= 9) return "moderate";
  if (num <= 15) return "high";
  return "deadly";
}

/**
 * Threat-tier classes and tokens.
 *
 * Class literals, not a computed `bg-cr-${tier}`: Tailwind extracts statically,
 * so only strings that appear in the source get generated. `*Var` exists for
 * the one consumer a class cannot reach — see `npcDisplay` for the same split.
 */
const CR_BG: Record<CrTier, string> = {
  unknown: "bg-cr-unknown",
  trivial: "bg-cr-trivial",
  low: "bg-cr-low",
  moderate: "bg-cr-moderate",
  high: "bg-cr-high",
  deadly: "bg-cr-deadly",
};

const CR_TEXT: Record<CrTier, string> = {
  unknown: "text-cr-unknown",
  trivial: "text-cr-trivial",
  low: "text-cr-low",
  moderate: "text-cr-moderate",
  high: "text-cr-high",
  deadly: "text-cr-deadly",
};

const CR_VARS: Record<CrTier, string> = {
  unknown: "var(--cr-unknown)",
  trivial: "var(--cr-trivial)",
  low: "var(--cr-low)",
  moderate: "var(--cr-moderate)",
  high: "var(--cr-high)",
  deadly: "var(--cr-deadly)",
};

/** Background class for a challenge rating's threat tier. */
export function crBg(cr: ChallengeRating): string {
  return CR_BG[crTier(cr)];
}

/** Text-colour class for a challenge rating's threat tier. */
export function crTextColor(cr: ChallengeRating): string {
  return CR_TEXT[crTier(cr)];
}

/** The tier's token as a `var()`, for SVG and canvas. */
export function crVar(cr: ChallengeRating): string {
  return CR_VARS[crTier(cr)];
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
