import { crToNumber, type ChallengeRating } from "@/lib/monsterDisplay";
import { MONSTER_TYPES, type Monster, type MonsterType } from "@/types/monster.types";

/**
 * Pulling a random monster for an improvised encounter (#764).
 *
 * Filter set: CR band and type — deliberately not habitat, even though
 * "what wanders into a forest" is the obvious pitch for this card. Every
 * shared/library monster is imported from Open5e with `habitat: null`
 * (`src/lib/library/open5eMonsterImport.ts:199`), which is ~2,900 of the
 * bestiary's rows, and a hand-built custom monster leaves the field blank as
 * often as not (`src/types/monster.types.ts:79`, free text with no picker
 * behind it). A filter that empties the pool for nearly every row is worse
 * than no filter, so habitat stays off this card. `monster_type` has no such
 * gap: it is a required, always-populated enum on every row, custom or
 * shared (`src/types/monster.types.ts:76`) — so it is the one secondary axis
 * offered here, alongside the CR band that does the real narrowing.
 *
 * CR-band boundaries deliberately match `LOOT_CR_TIERS`
 * (`src/types/lootTable.types.ts:16`): a DM who already reads "CR 5–10" as a
 * loot-table tier should not learn a second meaning for the same phrase on
 * this card.
 *
 * Kept apart from the widget per the pure-logic-module pattern
 * (`dmScreenCard.ts`): band membership at an exact boundary CR, and what a
 * fractional CR ("1/4") numerically means, are exactly the kind of thing
 * that is cheap to get right here and easy to get subtly wrong re-derived by
 * eye in a template.
 */

/** One CR band's numeric bounds, inclusive on both ends. */
interface CrBand {
  id: "0-4" | "5-10" | "11-16" | "17+";
  label: string;
  min: number;
  max: number;
}

export const CR_BANDS: readonly CrBand[] = [
  { id: "0-4", label: "CR 0–4", min: 0, max: 4 },
  { id: "5-10", label: "CR 5–10", min: 5, max: 10 },
  { id: "11-16", label: "CR 11–16", min: 11, max: 16 },
  { id: "17+", label: "CR 17+", min: 17, max: Infinity },
];

/**
 * `"any"` is a real, selectable option, not the absence of one — so the
 * filtered pool can include monsters with no rating at all (an AI generation
 * or a hand-built monster the DM never filled the field in for; see
 * `crToNumber`'s own docstring). A numbered band never matches those: an
 * unrated monster is not *confirmed* to sit inside any specific range, so
 * showing it under "CR 5–10" would be a guess dressed up as a filter result.
 */
export type CrBandId = "any" | CrBand["id"];

export const CR_BAND_OPTIONS: readonly { id: CrBandId; label: string }[] = [
  { id: "any", label: "Any CR" },
  ...CR_BANDS.map(({ id, label }) => ({ id, label })),
];

/** Whether a challenge rating falls inside the named band. */
export function crBandContains(bandId: CrBandId, cr: ChallengeRating): boolean {
  if (bandId === "any") return true;
  const num = crToNumber(cr);
  if (num === null) return false;
  return CR_BANDS.some((band) => band.id === bandId && num >= band.min && num <= band.max);
}

export type MonsterPullTypeFilter = "all" | MonsterType;

export const MONSTER_PULL_TYPE_OPTIONS: readonly MonsterPullTypeFilter[] = ["all", ...MONSTER_TYPES];

export interface MonsterPullFilters {
  crBand: CrBandId;
  type: MonsterPullTypeFilter;
}

/** The monsters one pull may draw from. CR band and type each narrow the
 *  pool independently — neither depends on the other passing first. */
export function filterMonstersForPull(
  monsters: readonly Monster[],
  filters: MonsterPullFilters,
): Monster[] {
  return monsters.filter(
    (m) =>
      (filters.type === "all" || m.monster_type === filters.type) &&
      crBandContains(filters.crBand, m.stat_block.challenge_rating),
  );
}

/**
 * The monster at `index` in an already-filtered pool, or `null` for an empty
 * one.
 *
 * Deliberately does not draw its own randomness: "which index" comes from
 * the central dice roller (`@/lib/dice/roller`), which is impure and plays a
 * sound, so it has no business inside the module a plain unit test imports.
 * A test picks a known index directly; the widget rolls a `pool.length`-sided
 * die and hands in the result. Both paths run the exact same line here, so
 * proving selection is index-driven (not, say, always the first match) is
 * proving it for the real pull too.
 */
export function pickMonster(monsters: readonly Monster[], index: number): Monster | null {
  return monsters[index] ?? null;
}
