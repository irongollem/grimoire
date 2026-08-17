import { LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

/**
 * The Atlas scale ladder.
 *
 * The 17 location types are not a flat set of kinds — they are a sequence of
 * *scales*, from the cosmic down to a single room. Nothing in the app encoded
 * that ordering before, so a continent and a broom closet read as equal peers
 * in every list, combobox and legend.
 *
 * A tier is the unit the Atlas groups and colours by. Type still says what a
 * place *is* (that is the label's job); the tier says how big it is.
 */
export const LOCATION_TIERS = [
  "cosmic",
  "continental",
  "settlement",
  "site",
  "venue",
  "interior",
] as const;

export type LocationTier = (typeof LOCATION_TIERS)[number];

/** Plural headings — these label groups of children, never a single place. */
export const TIER_LABELS: Record<LocationTier, string> = {
  cosmic: "Worlds & Planes",
  continental: "Lands",
  settlement: "Settlements",
  site: "Sites",
  venue: "Establishments",
  interior: "Interiors",
};

/**
 * Singular tier names for the scale rail, where each rung is a scale rather
 * than a bucket of places.
 */
export const TIER_RUNG_LABELS: Record<LocationTier, string> = {
  cosmic: "Cosmic",
  continental: "Land",
  settlement: "Settlement",
  site: "Site",
  venue: "Venue",
  interior: "Interior",
};

/**
 * `other` is deliberately absent: it is the escape hatch type, and forcing it
 * onto a rung of the ladder would claim a scale the DM never stated. It groups
 * under "Unplaced" instead, which is honest and surfaces places worth typing
 * properly.
 */
export const LOCATION_TYPE_TIER: Record<LocationType, LocationTier | null> = {
  world: "cosmic",
  plane: "cosmic",
  continent: "continental",
  region: "continental",
  country: "continental",
  city: "settlement",
  town: "settlement",
  village: "settlement",
  district: "site",
  building: "site",
  dungeon: "site",
  wilderness: "site",
  store: "venue",
  tavern: "venue",
  inn: "venue",
  room: "interior",
  other: null,
};

/**
 * The type whose colour stands for the whole tier on the scale rail. Colours
 * are *derived* from the ramp rather than restated, so a tier swatch can never
 * drift from the places it represents.
 */
export const TIER_REPRESENTATIVE_TYPE: Record<LocationTier, LocationType> = {
  cosmic: "world",
  continental: "region",
  settlement: "town",
  site: "building",
  venue: "tavern",
  interior: "room",
};

export const TIER_COLORS: Record<LocationTier, string> = Object.fromEntries(
  LOCATION_TIERS.map((tier) => [tier, LOCATION_TYPE_COLORS[TIER_REPRESENTATIVE_TYPE[tier]]]),
) as Record<LocationTier, string>;

export function tierOf(type: LocationType): LocationTier | null {
  return LOCATION_TYPE_TIER[type];
}

/** Ladder position, for the scale rail. `null` tier sorts last. */
export function tierIndex(type: LocationType): number {
  const tier = LOCATION_TYPE_TIER[type];
  return tier === null ? LOCATION_TIERS.length : LOCATION_TIERS.indexOf(tier);
}

export interface TierGroup {
  tier: LocationTier | null;
  label: string;
  locations: Location[];
}

/**
 * Buckets a location's children by scale, in ladder order, dropping empty
 * tiers. This is what the place pane renders instead of an undifferentiated
 * card grid: "Settlements 5 · Sites 2" tells a DM the shape of a region at a
 * glance, and needs no map or artwork to do it.
 */
export function groupByTier(locations: readonly Location[]): TierGroup[] {
  const buckets = new Map<LocationTier | null, Location[]>();
  for (const loc of locations) {
    const tier = tierOf(loc.location_type);
    const bucket = buckets.get(tier);
    if (bucket) bucket.push(loc);
    else buckets.set(tier, [loc]);
  }

  const groups: TierGroup[] = [];
  for (const tier of LOCATION_TIERS) {
    const found = buckets.get(tier);
    if (found) groups.push({ tier, label: TIER_LABELS[tier], locations: found });
  }
  const unplaced = buckets.get(null);
  if (unplaced) groups.push({ tier: null, label: "Unplaced", locations: unplaced });

  return groups;
}

/**
 * The tiers actually present beneath (and including) a location, used to dim
 * rungs the DM has not authored. A region with towns but no buildings shows
 * the gap rather than pretending the ladder stops there.
 */
export function occupiedTiers(locations: readonly Location[]): Set<LocationTier> {
  const present = new Set<LocationTier>();
  for (const loc of locations) {
    const tier = tierOf(loc.location_type);
    if (tier) present.add(tier);
  }
  return present;
}
