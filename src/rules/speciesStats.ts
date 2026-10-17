import type { SpeciesSize, SpeciesSpeed, SpeciesSubrace, SpeciesTrait } from "@/types/species.types";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";

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
  /** A library row's `languages` is a nullable text[]: null grants none. */
  languages: string[] | null;
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
  return [...new Set([...(species.languages ?? []), ...(findSubrace(species, subraceName)?.languages ?? [])])];
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

/** The 5e baseline walk when neither the species nor every subrace states one (mirrors `*_walk_speed_present`). */
export function withWalkSpeed<T extends { speed: SpeciesSpeed | null }>(
  fields: T,
  subraces: readonly SpeciesSubrace[] | null,
): T {
  if (speciesHasWalkSpeed({ speed: fields.speed, subraces: subraces ? [...subraces] : null })) return fields;
  return { ...fields, speed: { ...fields.speed, walk: DEFAULT_WALK_SPEED } };
}

/** A species with no size of its own whose subraces state one (darakhul, gearforged). */
export function speciesSizeFromSubrace(species: Pick<SpeciesStatsSource, "size" | "subraces">): boolean {
  return !species.size && !!species.subraces?.some((subrace) => subrace.size);
}

const SPEED_MODE_LABELS: Record<keyof SpeciesSpeed, string> = {
  walk: "Walk",
  fly: "Fly",
  swim: "Swim",
  climb: "Climb",
  burrow: "Burrow",
};

/** A speed as pills ("Walk 30ft"); a mode at zero or absent is left out. */
export function speedLabels(speed: SpeciesSpeed | null | undefined): string[] {
  if (!speed) return [];
  return (Object.keys(SPEED_MODE_LABELS) as (keyof SpeciesSpeed)[])
    .filter((mode) => typeof speed[mode] === "number" && speed[mode]! > 0)
    .map((mode) => `${SPEED_MODE_LABELS[mode]} ${speed[mode]}ft`);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What a subrace changes about its parent: size, speeds and extra languages, as pills. */
export function subraceStatPills(subrace: SpeciesSubrace): string[] {
  return [
    ...(subrace.size ? [capitalize(subrace.size)] : []),
    ...speedLabels(subrace.speed),
    ...(subrace.languages ?? []).map((lang) => `Lang: ${lang}`),
  ];
}

/**
 * One speed mode edited from a text field. An empty, non-numeric or negative
 * entry removes the mode (an absent mode means "as the species", never a stored
 * null); anything else sets it. Returns a new speed.
 */
export function setSpeedMode(
  speed: SpeciesSpeed,
  mode: keyof SpeciesSpeed,
  raw: string | number | null,
): SpeciesSpeed {
  const value = typeof raw === "number" ? raw : parseInt(String(raw));
  const { [mode]: _removed, ...rest } = speed;
  if (raw === null || Number.isNaN(value) || value < 0) return rest;
  return { ...rest, [mode]: value };
}

/**
 * How far a character of this species sees by darkvision, in feet (0 when it has none). A subrace's own darkvision
 * trait replaces its parent's ("Superior Darkvision" 120 over 60). The range lives only in the trait's prose, which
 * is often a stringified Tiptap document, so it is the first number before "feet", "foot" or "ft" in the document's
 * text. The text is read through the document rather than out of the JSON, because a mark on the number (a bold "60")
 * puts the number and its unit in separate text nodes.
 */
export function darkvisionFeet(
  species: Pick<SpeciesStatsSource, "subraces"> & { traits: SpeciesTrait[] | null },
  subraceName?: string | null,
): number {
  const subraceTrait = findSubrace(species, subraceName)?.traits.find(isDarkvisionTrait);
  const trait = subraceTrait ?? species.traits?.find(isDarkvisionTrait);
  if (!trait) return 0;
  const match = /(\d+)[\s-]*(?:feet|foot|ft)\b/i.exec(tiptapToPlainText(trait.description));
  return match ? Number(match[1]) : 0;
}

function isDarkvisionTrait(trait: SpeciesTrait): boolean {
  return trait.name.toLowerCase().includes("darkvision");
}
