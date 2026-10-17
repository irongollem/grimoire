import { SENSE_TYPES, senseRanges, type SenseType } from "@/lib/senses";
import { darkvisionFeet } from "@/rules/speciesStats";

type SpeciesForSenses = Parameters<typeof darkvisionFeet>[0];

/** Feet per sense; 0 means the character does not have it. */
export type SenseRanges = Record<SenseType, number>;

/**
 * What a character perceives beyond ordinary sight, in feet per sense: the better of what the species grants
 * (darkvision) and what the character's own senses field lists (class features, feats, items, spells). The two
 * sources do not add up: 5e takes the larger range, never the sum.
 */
export function characterSenses(input: {
  species: SpeciesForSenses | null | undefined;
  subrace?: string | null;
  senses: string | null | undefined;
}): SenseRanges {
  const out = senseRanges(input.senses);
  const fromSpecies = input.species ? darkvisionFeet(input.species, input.subrace) : 0;
  out.darkvision = Math.max(out.darkvision, fromSpecies);
  return out;
}

/** "Blindsight 10 ft., darkvision 60 ft." in a fixed order, for displays; "" when there are none. */
export function formatSenses(ranges: SenseRanges): string {
  const parts: string[] = [];
  for (const sense of SENSE_TYPES) {
    const feet = ranges[sense];
    if (feet) parts.push(`${sense} ${feet} ft.`);
  }
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
