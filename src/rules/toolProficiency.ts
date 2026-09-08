/**
 * `party_members.tool_proficiencies` is a free-text `string[]` fed from three
 * places — the character sheet's TagPickerInput (clean, catalogue-cased),
 * Open5e-imported background prose (dirty), and hand-authored homebrew
 * backgrounds (anything). Comparing it with exact `includes()` — the original
 * approach — means "Herbalist kit" never matches a discipline that requires
 * "Herbalism Kit", even though they are the same tool.
 *
 * This module is the single place that normalises a raw string into the
 * catalogue spelling from `TOOL_PROFICIENCY_GROUPS`, and the single place
 * that compares two tool lists. Anything that reads `tool_proficiencies` for
 * a mechanical check (as opposed to just displaying it) should go through
 * `hasToolProficiency` rather than re-deriving its own matching.
 */
import { TOOL_PROFICIENCY_GROUPS } from "@/lib/proficiency-lists";

// Built once from the catalogue rather than per call — keyed on lowercase so
// lookups are case-insensitive, valued with the catalogue's own casing so a
// match always returns the canonical spelling regardless of how it was typed.
const CATALOG_BY_LOWER: ReadonlyMap<string, string> = new Map(
  TOOL_PROFICIENCY_GROUPS.flatMap((group) => group.items.map((item) => [item.toLowerCase(), item] as const)),
);

/**
 * Real background text names a couple of kits differently from the
 * catalogue's PHB wording — "Herbalist kit" is the one measured in
 * production. Extend this map as more aliases surface rather than teaching
 * `canonicalToolName` a new special case per alias.
 */
const TOOL_ALIASES: ReadonlyMap<string, string> = new Map([
  ["herbalist kit", "Herbalism Kit"],
]);

// Strips a trailing plural "s" (Instruments → Instrument, Sets → Set) without
// touching a trailing possessive "'s" (Artisan's Tools → Artisan's Tool, not
// Artisan' Tool) — a plain /s\b/ regex matches the "s" in "'s" first because
// that's the first word-boundary-adjacent "s" in the string.
function naiveSingular(plural: string): string {
  return plural.endsWith("s") && !plural.endsWith("'s") ? plural.slice(0, -1) : plural;
}

// Group names, singular and plural, so "one musical instrument" is
// recognisable as "the whole category, unnamed" without hardcoding a list
// that could drift from TOOL_PROFICIENCY_GROUPS.
const CATEGORY_NOUNS: ReadonlySet<string> = new Set(
  TOOL_PROFICIENCY_GROUPS.flatMap((group) => {
    const plural = group.name.toLowerCase();
    return [plural, naiveSingular(plural)];
  }),
);

/**
 * Curly apostrophes show up in Open5e prose ("Thieves’ Tools"); the catalogue
 * and every alias key use the straight one. Also trims sentence-fragment
 * debris left over from splitting a background's benefit text on commas: a
 * leading "or " (e.g. "Alchemist's Supplies or Disguise Kit." split into two
 * entries) and a trailing full stop.
 */
function clean(raw: string): string {
  return raw
    .replace(/’/g, "'")
    .replace(/^or\s+/i, "")
    .replace(/\.\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "No additional tool proficiencies" is background-sheet boilerplate for
 * "nothing granted here" — it names no tool, so it must resolve to null
 * rather than being stored as a literal string.
 */
function isNoAdditionalGrant(cleaned: string): boolean {
  return /^no additional\b/i.test(cleaned);
}

/**
 * "Two of your choice", "One artisan's tools set of your choice", "Your
 * choice of one from Thieves' Tools" — the background text defers the pick to
 * the player.
 *
 * The last shape does name a real tool, and matching on "your choice"
 * anywhere (rather than only "of your choice") is what stops it being stored
 * as a proficiency literally called "Your choice of one from Thieves' Tools".
 * Resolving it *to* Thieves' Tools would be the opposite error: the sheet
 * offers that tool as one branch of a choice, so granting it outright invents
 * a proficiency the character may not have taken. Null is the honest answer
 * until backgrounds can record a resolved choice.
 */
function isDeferredChoice(cleaned: string): boolean {
  return /\byour choice\b/i.test(cleaned);
}

/**
 * "One type of gaming set", "One type of artisan's tools or one type of
 * musical instrument" — the same deferred-choice shape, phrased as "one type
 * of <category>" instead of "...of your choice".
 */
function isTypeOfCategory(cleaned: string): boolean {
  return /^one type of\b/i.test(cleaned);
}

/**
 * "One musical instrument" — a bare count plus a category noun with no
 * specific tool named. Matched against the catalogue's own group names
 * (singular or plural) so it can't be confused with an actual tool.
 */
function isBareCategoryCount(cleaned: string): boolean {
  const match = /^(?:one|two|three)\s+(.+)$/i.exec(cleaned);
  if (!match) return false;
  const rest = match[1].toLowerCase();
  return CATEGORY_NOUNS.has(rest);
}

/** True for prose that grants no specific tool at all — the "choice"/"no additional" family. */
function isNonProficiencyProse(cleaned: string): boolean {
  return (
    isNoAdditionalGrant(cleaned)
    || isDeferredChoice(cleaned)
    || isTypeOfCategory(cleaned)
    || isBareCategoryCount(cleaned)
  );
}

/**
 * Normalises a raw `tool_proficiencies` entry to the catalogue's canonical
 * spelling.
 *
 * Returns `null` only for prose that names no proficiency at all (see
 * `isNonProficiencyProse`). Everything else is cleaned and, if it matches the
 * catalogue or an alias, returned in canonical casing; an unrecognised but
 * plausible value (homebrew tools, or a non-tool entry like "Light Armor" —
 * this column also carries armour/weapon proficiencies) is returned cleaned
 * but otherwise unchanged, never dropped and never coerced to `""`.
 */
export function canonicalToolName(raw: string): string | null {
  const cleaned = clean(raw);
  if (!cleaned || isNonProficiencyProse(cleaned)) return null;
  const lower = cleaned.toLowerCase();
  return TOOL_ALIASES.get(lower) ?? CATALOG_BY_LOWER.get(lower) ?? cleaned;
}

/**
 * Whether `profs` (a character's stored tool proficiencies) satisfies any of
 * `required` (the tools a discipline/recipe accepts). Both sides are
 * canonicalised before comparing, so dirty stored data ("Herbalist kit") and
 * clean discipline config ("Herbalism Kit") still match.
 */
export function hasToolProficiency(
  profs: readonly string[] | null | undefined,
  required: readonly string[],
): boolean {
  if (!profs) return false;
  const owned = new Set(
    profs
      .map((prof) => canonicalToolName(prof))
      .filter((prof): prof is string => prof !== null)
      .map((prof) => prof.toLowerCase()),
  );
  return required.some((tool) => {
    const canonical = canonicalToolName(tool);
    return canonical !== null && owned.has(canonical.toLowerCase());
  });
}
