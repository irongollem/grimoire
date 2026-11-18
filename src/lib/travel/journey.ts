import type { RouteSummary } from "@/lib/locations/mapRoute";
import { effectiveLocationId } from "@/lib/partyPosition";
import { fromMiles, getTravelPace, travelTime, type TravelPaceId } from "@/rules/travelPace";
import type { Road } from "./roads";
import { placesPassed, shortestWay, stopsOf } from "./way";

/**
 * A journey along the roads from where the party is to a place (#1222).
 *
 * It ends up as the same thing a route measured on a map does (`RouteSummary`, #932): a distance, a pace and a
 * time between two places, which the calendar's travel event records. So a road and a measured route are planned,
 * shown and put on the calendar the same way, and only how the distance was found differs.
 */

/**
 * The place a journey starts or ends at when the party (or the destination) is somewhere inside it: the place
 * itself when a road touches it, else its nearest ancestor that one does. A party in the common room of an inn is,
 * for the road, in the town. Null when neither the place nor anything it lies in has a road.
 */
export function roadPlaceOf(placeId: string, parentOf: (id: string) => string | null, roads: readonly Road[]): string | null {
  const onRoad = new Set(roads.flatMap((road) => [road.from_location_id, road.to_location_id]));
  const seen = new Set<string>();
  for (let at: string | null = placeId; at !== null && !seen.has(at); at = parentOf(at)) {
    if (onRoad.has(at)) return at;
    seen.add(at);
  }
  return null;
}

/**
 * The party members setting out on a journey: those standing where it starts or inside it. A member with no place
 * of their own is with the party (`effectiveLocationId`), so a party of followers all set out together, and one in
 * the inn's common room sets out from the town the road leaves. Walking up stops at a place on one of `roads` that
 * is not the start: someone in a village with roads of its own is at that village. Pass no roads for a journey
 * measured on a map, whose start is a pin and has no roads to stop at.
 */
export function travellersOf(input: {
  origin: string;
  members: readonly { id: string; current_location_id: string | null }[];
  partyAt: string | null;
  parentOf: (id: string) => string | null;
  roads: readonly Road[];
}): string[] {
  const onRoad = new Set(input.roads.flatMap((road) => [road.from_location_id, road.to_location_id]));
  const startsHere = (placeId: string): boolean => {
    const seen = new Set<string>();
    for (let at: string | null = placeId; at !== null && !seen.has(at); at = input.parentOf(at)) {
      if (at === input.origin) return true;
      if (onRoad.has(at)) return false;
      seen.add(at);
    }
    return false;
  };
  return input.members.filter((m) => {
    const at = effectiveLocationId(m, input.partyAt);
    return at !== null && startsHere(at);
  }).map((m) => m.id);
}

export interface Journey {
  /** As the map's measuring tool summarises a route, so everything downstream of it is shared. */
  summary: RouteSummary;
  /** The places the road passes between its two ends, by name, in order. */
  passing: string[];
  /** The roads the journey takes, in order; none for a journey measured across a map. */
  roadIds: string[];
  /** Where the journey can pause, in order: each night's camp and each place passed. None across a map. */
  stops: JourneyStop[];
}

export type JourneyStop = { kind: "night"; night: number } | { kind: "place"; name: string };

/** "Night 1, then Leilon, then night 2", or nothing for a journey with no stop on it. */
export function stopsText(stops: readonly JourneyStop[]): string {
  const words = stops.map((stop) => (stop.kind === "night" ? `night ${stop.night}` : stop.name));
  if (words.length === 0) return "";
  const text = words.join(", then ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The encounter tables of the roads a journey takes (`location_roads.roll_table_id`), in the journey's order, each
 * once: what a DM may roll on for a stop on the way. A road with no table of its own adds nothing.
 */
export function roadTableIds(journey: Pick<Journey, "roadIds">, roads: readonly Road[]): string[] {
  const byId = new Map(roads.map((road) => [road.id, road]));
  const ids: string[] = [];
  for (const roadId of journey.roadIds) {
    const tableId = byId.get(roadId)?.roll_table_id;
    if (typeof tableId === "string" && !ids.includes(tableId)) ids.push(tableId);
  }
  return ids;
}

/**
 * The journey by road between two places at a pace, or null when no chain of roads joins them (or they are the
 * same place for the road). Written in kilometres only when every road of the way is; otherwise in miles.
 */
export function journeyByRoad(input: {
  fromId: string;
  toId: string;
  roads: readonly Road[];
  parentOf: (id: string) => string | null;
  nameOf: (id: string) => string;
  paceId: TravelPaceId;
}): Journey | null {
  const from = roadPlaceOf(input.fromId, input.parentOf, input.roads);
  const to = roadPlaceOf(input.toId, input.parentOf, input.roads);
  if (from === null || to === null || from === to) return null;
  const way = shortestWay(from, to, input.roads);
  if (way === null || way.legs.length === 0) return null;
  const byId = new Map(input.roads.map((road) => [road.id, road]));
  const unit = way.legs.every((leg) => byId.get(leg.roadId)?.unit === "km") ? "km" : "mi";
  const distance = fromMiles(way.miles, unit);
  return {
    summary: {
      distance,
      unit,
      paceId: input.paceId,
      time: travelTime(distance, unit, input.paceId),
      from: { id: from, name: input.nameOf(from) },
      to: { id: to, name: input.nameOf(to) },
    },
    passing: placesPassed(way).map(input.nameOf),
    roadIds: way.legs.map((leg) => leg.roadId),
    stops: stopsOf(way, getTravelPace(input.paceId).milesPerDay).map((stop): JourneyStop => (stop.kind === "night" ? stop : { kind: "place", name: input.nameOf(stop.placeId) })),
  };
}

/** "by way of Brightwater and the Ford", or nothing for a road that passes no other place. */
export function passingText(passing: readonly string[]): string {
  if (passing.length === 0) return "";
  const list = passing.length === 1 ? passing[0] : `${passing.slice(0, -1).join(", ")} and ${passing[passing.length - 1]}`;
  return `by way of ${list}`;
}
