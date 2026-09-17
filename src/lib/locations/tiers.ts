import { LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

/**
 * The Atlas ladder — rungs of *map kind*, not of size.
 *
 * It used to claim to encode size ("type says what a place is; tier says how
 * big it is"), and never actually did — the ladder was auto-generated, so
 * nobody had checked. `venue` encoded function, not scale: "has an
 * inventory" is what that rung actually meant, and `STORE_LOCATION_TYPES`
 * already owns that fact. `wilderness` had no scale at all — production has
 * a `wilderness` (Icewind Dale) that itself contains 9 villages and 4
 * regions, so a ladder built on size read that as a place smaller than its
 * own contents.
 *
 * A tier now says **what kind of map a place has, and therefore how its
 * children get placed on it**: pins down through `district`, traced regions
 * on a floor plan at `site`. `venue` is gone — a tavern is a building, one of
 * six types with a floor plan. `wilderness` moved to `land`, beside
 * continent/region/country, where "no floor plan, children placed by pins"
 * actually describes it. `district` earned its own rung: its children are
 * buildings on a geography map, not traced rooms.
 *
 * The sixth of those six is `wilds` (#886), which #810 had no name for: a
 * *site*-scale natural place — a wood, a marsh, a graveyard — that carries its
 * own plan. It is emphatically not `wilderness`, which stays up at `land` on
 * pins; the same forest can be both, a `wilderness` the party crosses on the
 * world map and a `wilds` for the stretch they walk through part by part. The
 * same change moved `grounds` the other way, down to `interior`, where it had
 * always belonged — a glade or a hedge maze is an open-air *room*, not a
 * container. See `isInteriorType` below.
 *
 * Type still says what a place *is* (that is the label's job); the tier says
 * what kind of map it gets.
 */
export const LOCATION_TIERS = [
  "cosmic",
  "land",
  "settlement",
  "district",
  "site",
  "interior",
] as const;

export type LocationTier = (typeof LOCATION_TIERS)[number];

/** Plural headings — these label groups of children, never a single place. */
export const TIER_LABELS: Record<LocationTier, string> = {
  cosmic: "Worlds & Planes",
  land: "Lands",
  settlement: "Settlements",
  district: "Districts",
  site: "Sites",
  interior: "Interiors",
};

/**
 * Singular tier names for the scale rail, where each rung is a scale rather
 * than a bucket of places.
 */
export const TIER_RUNG_LABELS: Record<LocationTier, string> = {
  cosmic: "Cosmic",
  land: "Land",
  settlement: "Settlement",
  district: "District",
  site: "Site",
  interior: "Interior",
};

/**
 * `other` is deliberately absent: it is the escape hatch type, and forcing it
 * onto a rung of the ladder would claim a map kind the DM never stated. It
 * groups under "Unplaced" instead, which is honest and surfaces places worth
 * typing properly.
 */
export const LOCATION_TYPE_TIER: Record<LocationType, LocationTier | null> = {
  world: "cosmic",
  plane: "cosmic",
  continent: "land",
  region: "land",
  country: "land",
  wilderness: "land",
  city: "settlement",
  town: "settlement",
  village: "settlement",
  district: "district",
  building: "site",
  dungeon: "site",
  store: "site",
  tavern: "site",
  inn: "site",
  wilds: "site",
  room: "interior",
  grounds: "interior",
  other: null,
};

/**
 * The type whose colour stands for the whole tier on the scale rail. Colours
 * are *derived* from the ramp rather than restated, so a tier swatch can never
 * drift from the places it represents.
 */
export const TIER_REPRESENTATIVE_TYPE: Record<LocationTier, LocationType> = {
  cosmic: "world",
  land: "region",
  settlement: "town",
  district: "district",
  site: "building",
  interior: "room",
};

export const TIER_COLORS: Record<LocationTier, string> = Object.fromEntries(
  LOCATION_TIERS.map((tier) => [tier, LOCATION_TYPE_COLORS[TIER_REPRESENTATIVE_TYPE[tier]]]),
) as Record<LocationTier, string>;

/**
 * Whether an arbitrary value is one of the 19 location types. `LOCATION_TYPE_TIER`
 * is keyed by every one of them, so membership in it *is* the check — which keeps
 * callers holding loosely-typed data (realtime payloads) from having to assert a
 * shape they cannot actually see.
 */
export function isLocationType(value: unknown): value is LocationType {
  return typeof value === "string" && value in LOCATION_TYPE_TIER;
}

export function tierOf(type: LocationType): LocationTier | null {
  return LOCATION_TYPE_TIER[type];
}

/**
 * True for the `site` tier — building, dungeon, store, tavern, inn, wilds:
 * the six types with a floor plan. This is the single answer to "does this
 * place get a Rooms panel (#783) and traced map regions (#784) instead of
 * pins" — `private.location_can_hold_rooms` mirrors this same six-type set
 * in the database, so the panel and the constraint agree by construction
 * rather than being two predicates that happen to line up. `wilds` replaced
 * `grounds` here in #886: `grounds` moved down to `interior`, beside `room`
 * — it is now a *space inside* a site's floor plan rather than a site of its
 * own, while `wilds` (a wood, a marsh, a graveyard the party walks through
 * part by part) is the thing that carries the plan.
 *
 * Keeps the name `isSiteType` rather than becoming `isStructureType` or
 * similar: "site" is already a term of art across this epic —
 * `location_map_regions.site_location_id`, `SiteRoomsPanel`, `SiteRunSurface`,
 * `siteRun.ts`, `useSiteDoors` — and only this module ever disagreed with it.
 */
export function isSiteType(type: LocationType): boolean {
  return LOCATION_TYPE_TIER[type] === "site";
}

/**
 * True for the `interior` tier — `room` and `grounds`: the two types bound
 * to another place's floor plan rather than carrying one of their own. This
 * is the client mirror of `private.location_is_interior` in the database —
 * the database is the authority, and this exists so the UI never offers what
 * it will refuse. `room` is walled and roofed; `grounds` is the same idea
 * without a roof (a glade, a grave plot, a hedge maze bound to a site's
 * plan) — both differ from `wilds`, which is open air but carries its own
 * floor plan and so sits at `site` instead.
 */
export function isInteriorType(type: LocationType): boolean {
  return LOCATION_TYPE_TIER[type] === "interior";
}

/**
 * What a site's parts *are*, and what to call them (#886, #887).
 *
 * A site divides into interior spaces, and which interior type those are
 * follows the site's own nature: a `wilds` — a wood, a marsh, a graveyard —
 * divides into open-air `grounds`, everything else into walled `room`s.
 *
 * These three live together, and here rather than in a module of their own,
 * because they are all the same fact read three ways: the type a new part is
 * created as, the noun a count is rendered with, and the heading a panel of
 * them carries. Six call sites had hand-rolled `location_type === "wilds"`
 * before this existed, and the display strings around them had not followed —
 * so a wood's parts were counted correctly and still called "rooms". That is
 * the shape of a rule that needs one reader, not a seventh copy.
 *
 * "grounds" is deliberately invariant in the plural and takes no article:
 * "Add grounds…", "3 grounds", "Needs grounds". `pluralizeCount` handles that
 * given the pair below; do not special-case it at a call site.
 */
export function childSpaceType(siteType: LocationType | null | undefined): Extract<LocationType, "room" | "grounds"> {
  return siteType === "wilds" ? "grounds" : "room";
}

/** The noun for a site's parts, as a `pluralizeCount` pair. */
export function spaceNoun(siteType: LocationType | null | undefined): { singular: string; plural: string } {
  return childSpaceType(siteType) === "grounds"
    ? { singular: "grounds", plural: "grounds" }
    : { singular: "room", plural: "rooms" };
}

/** Title-case heading for a panel listing a site's parts — "Rooms" / "Grounds". */
export function spaceHeading(siteType: LocationType | null | undefined): string {
  return childSpaceType(siteType) === "grounds" ? "Grounds" : "Rooms";
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

/**
 * The children of a site that can carry a traced region on its map (#818).
 *
 * An interior space (a room, or a `grounds` courtyard — #886 moved `grounds`
 * to the `interior` tier), or a nested site — either occupies an area of the
 * parent's floor plan exactly as a room does, and tracing its footprint to
 * click through into it is the same descent a pin already gives, drawn as a
 * polygon instead of a point.
 *
 * Direct children only: the database guard requires the bound location to be a
 * child of the site the region is drawn on, so offering a grandchild here would
 * build a picker whose choices are rejected on save.
 *
 * This mirrors the type half of `guard_location_map_region_space`. The database
 * is the authority; this exists so the UI never offers what it will refuse.
 */
export function bindableSpaces<T extends { location_type: LocationType }>(
  children: readonly T[],
): T[] {
  return children.filter((c) => isInteriorType(c.location_type) || isSiteType(c.location_type));
}
