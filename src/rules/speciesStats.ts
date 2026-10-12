import type { SpeciesSize, SpeciesSpeed, SpeciesSubrace } from "@/types/species.types";

/**
 * What a character of a species (and, optionally, one of its subraces) is:
 * size, speeds and languages. A subrace changes its parent (see
 * `SpeciesSubrace`): size replaces, speed replaces mode by mode, languages add.
 * Some species leave a value wholly to the subrace ("Your size is determined by
 * your Heritage Subrace"), so reading the parent alone is wrong for them.
 */
export interface SpeciesStatsSource {
  size: SpeciesSize | null;
  speed: SpeciesSpeed | null;
  languages: string[];
  subraces: SpeciesSubrace[] | null;
}

/** Walking speed when nothing states one: a custom species' starting value, and the 5e baseline. */
export const DEFAULT_WALK_SPEED = 30;

export function findSubrace(species: Pick<SpeciesStatsSource, "subraces">, subraceName: string | null | undefined): SpeciesSubrace | null {
  if (!subraceName) return null;
  return species.subraces?.find((subrace) => subrace.name === subraceName) ?? null;
}

export function effectiveSize(species: SpeciesStatsSource, subraceName?: string | null): SpeciesSize | null {
  return findSubrace(species, subraceName)?.size ?? species.size;
}

export function effectiveSpeed(species: SpeciesStatsSource, subraceName?: string | null): SpeciesSpeed | null {
  const merged: SpeciesSpeed = { ...species.speed, ...findSubrace(species, subraceName)?.speed };
  return Object.keys(merged).length ? merged : null;
}

/** The species' languages and the subrace's, each once, parent's first. */
export function effectiveLanguages(species: SpeciesStatsSource, subraceName?: string | null): string[] {
  return [...new Set([...species.languages, ...(findSubrace(species, subraceName)?.languages ?? [])])];
}

/**
 * True when every character of this species ends up with a walking speed:
 * the species states one, or it has subraces and each states one. The
 * database holds `species` and `library_species` to the same rule (check
 * constraint `*_walk_speed_present`).
 */
export function speciesHasWalkSpeed(species: Pick<SpeciesStatsSource, "speed" | "subraces">): boolean {
  if (typeof species.speed?.walk === "number") return true;
  const subraces = species.subraces ?? [];
  return subraces.length > 0 && subraces.every((subrace) => typeof subrace.speed?.walk === "number");
}

/** True when the species leaves its walking speed to the subrace, so a character needs one chosen to have a speed. */
export function walkSpeedFromSubrace(species: Pick<SpeciesStatsSource, "speed" | "subraces">): boolean {
  return typeof species.speed?.walk !== "number" && speciesHasWalkSpeed(species);
}
