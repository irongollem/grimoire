import type { RouteSummary } from "@/lib/locations/mapRoute";
import { effectiveLocationId } from "@/lib/partyPosition";
import { fromMiles, timeOfTravelHours } from "@/rules/travelPace";
import { legTravelHours, WAY_PRESETS, type TimedLeg, type TravelContext } from "@/rules/travelSpeed";
import type { Road } from "./roads";
import { placesPassed, roadPlaceOf, shortestWay, stopsOfTimed } from "./way";

/**
 * A journey along the roads from where the party is to a place (#1222).
 *
 * It ends up as the same thing a route measured on a map does (`RouteSummary`, #932): a distance, a pace and a
 * time between two places, which the calendar's travel event records. So a road and a measured route are planned,
 * shown and put on the calendar the same way, and only how the distance was found differs.
 */

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
  /** The places the journey touches, in order: where it starts, each place passed, where it ends. */
  placeIds: string[];
  /** The roads the journey takes, in order; none for a journey measured across a map. */
  roadIds: string[];
  /** Where the journey can pause, in order: each night's camp and each place passed. None across a map. */
  stops: JourneyStop[];
  /** The ground it crosses other than road and open country, by terrain key, with how far of it (summary's unit). */
  grounds: { terrain: string; distance: number }[];
  /** Whether any leg is a river or the sea, so a boat is worth asking about. */
  waterLegs: boolean;
  /** A journey across a map with the "Off the Road" rule on: the distance already counts the winding. */
  offRoad: boolean;
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
 * A leg's travel hours by the way of travelling. A way that cannot move (a sled whose puller was dismissed) is not
 * offered by the journey line; should one reach here, the leg is walked rather than taking forever.
 */
export function travelHoursOf(leg: TimedLeg, travel: TravelContext): number {
  return legTravelHours(leg, travel) ?? legTravelHours(leg, { ...travel, way: WAY_PRESETS[0] }) ?? 0;
}

/** The ground of a journey other than road and open country, in the order first met, each with its distance. */
export function groundsOf(legs: readonly { miles: number; terrain: string }[], unit: "mi" | "km"): { terrain: string; distance: number }[] {
  const miles = new Map<string, number>();
  for (const leg of legs) {
    if (leg.terrain === "road" || leg.terrain === "open") continue;
    miles.set(leg.terrain, (miles.get(leg.terrain) ?? 0) + leg.miles);
  }
  return [...miles].map(([terrain, m]) => ({ terrain, distance: fromMiles(m, unit) }));
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
  /** The pace, the way of travelling, the campaign's terrains and its companions' speeds (`rules/travelSpeed.ts`). */
  travel: TravelContext;
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
      paceId: input.travel.paceId,
      time: timeOfTravelHours(way.legs.reduce((hours, leg) => hours + travelHoursOf(leg, input.travel), 0)),
      from: { id: from, name: input.nameOf(from) },
      to: { id: to, name: input.nameOf(to) },
    },
    passing: placesPassed(way).map(input.nameOf),
    placeIds: [from, ...placesPassed(way), to],
    roadIds: way.legs.map((leg) => leg.roadId),
    stops: stopsOfTimed(way, (leg) => travelHoursOf(leg, input.travel)).map((stop): JourneyStop => (stop.kind === "night" ? stop : { kind: "place", name: input.nameOf(stop.placeId) })),
    grounds: groundsOf(way.legs, unit),
    waterLegs: way.legs.some((leg) => leg.going === "river" || leg.going === "sea"),
    offRoad: false,
  };
}

/** "by way of Brightwater and the Ford", or nothing for a road that passes no other place. */
export function passingText(passing: readonly string[]): string {
  if (passing.length === 0) return "";
  const list = passing.length === 1 ? passing[0] : `${passing.slice(0, -1).join(", ")} and ${passing[passing.length - 1]}`;
  return `by way of ${list}`;
}
