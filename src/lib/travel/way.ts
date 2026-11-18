import { toMiles } from "../../rules/travelPace.ts";
import { otherEnd, type Going, type Road } from "./roads.ts";

/**
 * The way between two places (#1222): the shortest chain of roads, with the places it passes.
 *
 * Travel follows the roads. Between two towns that are not directly joined, the way goes by whichever towns make
 * it shortest, and each of those is somewhere the story can stop. No chain of roads between two places means the
 * way is unknown, which is an answer in its own right: the app says so and offers to add the road.
 */
export interface Leg {
  roadId: string;
  from: string;
  to: string;
  miles: number;
  name: string;
  going: Going;
}

export interface Way {
  miles: number;
  legs: Leg[];
}

/**
 * The shortest way from one place to another along the roads, in miles. Null when no chain of roads joins them;
 * a way of no legs when the two are the same place. Between two ways of the same length the one with fewer legs
 * wins, so the answer does not depend on the order the roads were entered in.
 */
export function shortestWay(fromId: string, toId: string, roads: readonly Road[]): Way | null {
  if (fromId === toId) return { miles: 0, legs: [] };
  const roadsAt = new Map<string, Road[]>();
  for (const road of roads) {
    for (const end of [road.from_location_id, road.to_location_id]) {
      const list = roadsAt.get(end);
      if (list === undefined) roadsAt.set(end, [road]);
      else list.push(road);
    }
  }
  if (!roadsAt.has(fromId) || !roadsAt.has(toId)) return null;

  // Dijkstra. A campaign has tens of roads, not thousands, so the frontier is scanned rather than heaped.
  const best = new Map<string, { miles: number; legs: number; via: Leg | null }>([[fromId, { miles: 0, legs: 0, via: null }]]);
  const settled = new Set<string>();
  for (;;) {
    let here: string | null = null;
    for (const [place, reach] of best) {
      if (settled.has(place)) continue;
      const lead = here === null ? undefined : best.get(here);
      if (lead === undefined || reach.miles < lead.miles || (reach.miles === lead.miles && reach.legs < lead.legs)) here = place;
    }
    if (here === null) return null;
    if (here === toId) break;
    settled.add(here);
    const reached = best.get(here);
    if (reached === undefined) return null;
    for (const road of roadsAt.get(here) ?? []) {
      const next = otherEnd(road, here);
      if (next === null || settled.has(next)) continue;
      const miles = reached.miles + toMiles(road.distance, road.unit);
      const legs = reached.legs + 1;
      const known = best.get(next);
      if (known === undefined || miles < known.miles || (miles === known.miles && legs < known.legs)) {
        best.set(next, { miles, legs, via: { roadId: road.id, from: here, to: next, miles: toMiles(road.distance, road.unit), name: road.name, going: road.going } });
      }
    }
  }

  const legs: Leg[] = [];
  let at = toId;
  while (at !== fromId) {
    const reach = best.get(at);
    if (reach === undefined || reach.via === null) return null;
    legs.unshift(reach.via);
    at = reach.via.from;
  }
  const end = best.get(toId);
  return end === undefined ? null : { miles: end.miles, legs };
}

/** The places a way passes between its two ends, in order: where the story can stop on the road. */
export function placesPassed(way: Way): string[] {
  return way.legs.slice(0, -1).map((leg) => leg.to);
}

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
