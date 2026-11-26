/**
 * The words of the field guide (#1283), as the tables in `20261126162306_habitat_ecology.sql` hold them: clades
 * (kin, nested), species, their forms (an age or a domesticated breed, each with at most one stat block), the links
 * between species, what a species yields, and a habitat's species with how common each is there. Every closed list
 * here is a `check` in that migration; `ecologyTypesMirror.test.ts` holds the two equal.
 */
import type { SeasonKind } from "@/types/calendar.types";

export const KINGDOMS = ["animal", "plant", "fungus", "other"] as const;
export type Kingdom = (typeof KINGDOMS)[number];

/** How a species lives, which with how common it is sets how often it is met. */
export const LIVES_AS = ["alone", "pairs", "family", "harem", "herd", "colony"] as const;
export type LivesAs = (typeof LIVES_AS)[number];

/** When a species is about: by day, at dawn and dusk, by night, at any time. */
export const ACTIVITIES = ["day", "twilight", "night", "any"] as const;
export type Activity = (typeof ACTIVITIES)[number];

/** How common a species is in one habitat. */
export const ABUNDANCES = ["very_rare", "rare", "uncommon", "common", "abundant"] as const;
export type Abundance = (typeof ABUNDANCES)[number];

export const LINK_KINDS = ["eats", "competes", "helps", "lives_on", "shelters", "carries"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** The hour the DM says it is when rolling; the campaign keeps no clock. */
export const TIMES_OF_DAY = ["dawn", "day", "dusk", "night"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export interface Clade {
  id: string;
  name: string;
  /** Free words ("family", "order"), or null. */
  rank: string | null;
  parentId: string | null;
  /** Tiptap JSON. */
  description: string | null;
  sortOrder: number;
}

export interface SpeciesSeason {
  /** Gone, asleep or migrated: off the roll that season. */
  away: boolean;
  note: string | null;
}

export interface Species {
  id: string;
  name: string;
  scientificName: string | null;
  cladeId: string | null;
  kingdom: Kingdom;
  livesAs: LivesAs | null;
  activity: Activity | null;
  seasons: Partial<Record<SeasonKind, SpeciesSeason>>;
  /** Tiptap JSON. */
  description: string | null;
  sortOrder: number;
}

export interface SpeciesForm {
  id: string;
  speciesId: string;
  /** The stage or breed: "Young", "Old", "Household". */
  label: string;
  stageOrder: number;
  domesticated: boolean;
  /** The DM's own stat block, or null. */
  monsterId: string | null;
  /** A shared book's stat block (text id), or null. At most one of the two is set. */
  libraryMonsterId: string | null;
}

export interface SpeciesLink {
  id: string;
  fromSpeciesId: string;
  kind: LinkKind;
  /** Null only for `shelters` and `carries` ("other animals"). */
  toSpeciesId: string | null;
  fromFormId: string | null;
  toFormId: string | null;
  /** Only in this habitat; null is wherever the two meet. */
  habitatId: string | null;
  note: string | null;
}

export interface SpeciesYield {
  id: string;
  speciesId: string;
  itemId: string | null;
  libraryItemId: string | null;
  note: string | null;
  sortOrder: number;
}

/** A species living in a habitat. */
export interface HabitatSpecies {
  id: string;
  habitatId: string;
  speciesId: string;
  abundance: Abundance | null;
  sortOrder: number;
}

/**
 * A form on a habitat's roll (`campaign_habitat_life_named`). `percent` is the DM's share, or null for one worked out
 * in code (`ecology.ts`).
 */
export interface HabitatLifeRow {
  id: string;
  habitatId: string;
  speciesId: string;
  formId: string;
  percent: number | null;
  sortOrder: number;
  /** The form's stat block: a text id for a book's, a uuid for the DM's own; null when the form has none. */
  recordId: string | null;
  fromLibrary: boolean;
  /** The stat block's name, or null when this reader may not read it (a co-DM's own) or there is none. */
  name: string | null;
  speciesName: string;
  formLabel: string;
}
