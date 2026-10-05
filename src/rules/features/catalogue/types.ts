import type {
  FeatAbilityIncrease,
  FeatCategory,
  FeatPrerequisites,
  FeatureMechanics,
} from "@/rules/features/mechanics.types";

/**
 * The SRD catalogues (#976): what each official feature and feat *does*, keyed
 * by its Open5e record key (`srd_rogue_sneak-attack`, `srd-2024_alert`).
 *
 * Mechanics only, never rules text. The text comes from Open5e with the row;
 * this supplies what Open5e cannot say (action cost, uses, scaling, riders,
 * choices), checked against the book of each edition. The admin import writes
 * an entry into the row's `mechanics` (and, for a feat, its feat columns), so
 * the sheet and level-up read official and homebrew features the same way.
 *
 * A record key missing from a catalogue imports with empty mechanics: a
 * passive feature, which is the honest answer for most of them.
 */
export type FeatureCatalogue = Readonly<Record<string, FeatureMechanics>>;

export interface FeatCatalogueEntry {
  /** 2024 only; null for a 2014 feat. */
  category: FeatCategory | null;
  prerequisites: FeatPrerequisites | null;
  repeatable: boolean;
  ability_increase: FeatAbilityIncrease | null;
  mechanics: FeatureMechanics;
}

export type FeatCatalogue = Readonly<Record<string, FeatCatalogueEntry>>;
