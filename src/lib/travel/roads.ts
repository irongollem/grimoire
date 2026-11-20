/**
 * Roads between places (#1222): the rows of `location_roads` as the app reads them.
 *
 * A road joins two places and says how far it is, the way a book says it in a town's entry ("Brightwater, 40 mi
 * by the coast road"). It reads from both ends. Distances are worked with in miles; a road entered in kilometres
 * keeps its unit for showing. The units, their conversion and how a distance is written are the app's one set
 * (`rules/travelPace`, `lib/locations/mapScale`), shared with the map's measuring tool.
 */
import { formatDistance } from "../locations/mapScale.ts";
import { toMiles, type DistanceUnit } from "../../rules/travelPace.ts";

export type { DistanceUnit };
export type Going = "road" | "track" | "river" | "sea";

export interface Road {
  id: string;
  /** The two places it joins. Stored in one order; which is "from" means nothing. */
  from_location_id: string;
  to_location_id: string;
  distance: number;
  unit: DistanceUnit;
  /** "the coast road"; empty when it has no name. */
  name: string;
  going: Going;
  /** The going underfoot: a terrain key (`rules/travelSpeed.ts` presets, or the campaign's own). */
  terrain: string;
  /** The road's own encounter table (Dungeon Craft), when the DM gave it one. */
  roll_table_id: string | null;
}

/** The place at the other end of a road, seen from one of its ends; null when the road does not touch that place. */
export function otherEnd(road: Pick<Road, "from_location_id" | "to_location_id">, placeId: string): string | null {
  if (road.from_location_id === placeId) return road.to_location_id;
  if (road.to_location_id === placeId) return road.from_location_id;
  return null;
}

export interface RoadFromHere {
  road: Road;
  /** The place it leads to from here. */
  otherId: string;
}

/**
 * The roads out of a place, as its entry lists them: nearest first, then by the road's name, so the list reads
 * the same every time it is opened.
 */
export function roadsFrom(placeId: string, roads: readonly Road[]): RoadFromHere[] {
  return roads
    .flatMap((road): RoadFromHere[] => {
      const otherId = otherEnd(road, placeId);
      return otherId === null ? [] : [{ road, otherId }];
    })
    .sort((a, b) => toMiles(a.road.distance, a.road.unit) - toMiles(b.road.distance, b.road.unit) || a.road.name.localeCompare(b.road.name) || a.road.id.localeCompare(b.road.id));
}

const GOING_WORDS: Record<Going, string> = { road: "by road", track: "by track", river: "by river", sea: "by sea" };

/** Terrains a road is assumed to have: said nothing of. */
const PLAIN_GOING = new Set(["road", "open"]);

/**
 * How a road reads in a place's entry: "40 mi by the coast road", "12 mi by track, snow". A terrain other than a
 * road or open country is named, by the campaign's name for it when `terrainName` knows one.
 */
export function roadText(road: Pick<Road, "distance" | "unit" | "name" | "going" | "terrain">, terrainName?: (key: string) => string | null): string {
  const how = road.name.trim() !== "" ? `by ${road.name.trim()}` : GOING_WORDS[road.going];
  const ground = PLAIN_GOING.has(road.terrain) ? null : (terrainName?.(road.terrain) ?? TERRAIN_WORDS[road.terrain] ?? null);
  return `${formatDistance(road.distance, road.unit)} ${how}${ground ? `, ${ground.toLowerCase()}` : ""}`;
}

const TERRAIN_WORDS: Record<string, string> = { difficult: "difficult going", sand: "sand", snow: "snow" };
