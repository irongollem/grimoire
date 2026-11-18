import { summarizeRoute } from "@/lib/locations/mapRoute";
import type { ImageSize } from "@/lib/locations/mapScale";
import type { TravelPaceId } from "@/rules/travelPace";
import type { MapPin, MapScale } from "@/types/location.types";
import type { Journey } from "./journey";

/**
 * The straight line on a map, for two places no road joins (#1222, story 2).
 *
 * Roads come first: a distance someone wrote down is truer than a ruler laid across a picture. Where there is no
 * chain of roads, the map both places are pinned on still says how far apart they are as the crow flies, provided
 * it has a scale. It is the same sum the map's measuring tool makes between two pins (#932), found without
 * opening the map.
 */

export interface SharedMap {
  /** The place whose map shows both: the nearest place both lie inside. */
  mapId: string;
  /** Each end and the places it lies inside, nearest first, up to (not including) the shared place. */
  fromBranch: string[];
  toBranch: string[];
}

function chainOf(id: string, parentOf: (id: string) => string | null): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  for (let at: string | null = id; at !== null && !seen.has(at); at = parentOf(at)) {
    chain.push(at);
    seen.add(at);
  }
  return chain;
}

/**
 * The map two places would both be pinned on: that of the nearest place both lie inside. Null when they share no
 * such place, and when one lies inside the other (a room and its own town are not a journey apart).
 */
export function sharedMapOf(fromId: string, toId: string, parentOf: (id: string) => string | null): SharedMap | null {
  const fromChain = chainOf(fromId, parentOf);
  const toChain = chainOf(toId, parentOf);
  const mapId = fromChain.find((id) => toChain.includes(id));
  if (mapId === undefined || mapId === fromId || mapId === toId) return null;
  return { mapId, fromBranch: fromChain.slice(0, fromChain.indexOf(mapId)), toBranch: toChain.slice(0, toChain.indexOf(mapId)) };
}

/** The pin that stands for an end on the shared map: its own, else that of the nearest place it lies inside. */
function pinOf(branch: readonly string[], pins: readonly MapPin[]): MapPin | null {
  for (const id of branch) {
    const pin = pins.find((p) => p.child_location_id === id);
    if (pin) return pin;
  }
  return null;
}

/**
 * The journey in a straight line across the shared map at a pace, or null when it cannot be measured: the map has
 * no scale, its picture's size is not known yet, either end has no pin on it, or both ends are under one pin.
 */
export function journeyByMap(input: {
  shared: SharedMap;
  pins: readonly MapPin[];
  scale: MapScale | null;
  size: ImageSize | null;
  paceId: TravelPaceId;
}): Journey | null {
  if (input.scale === null || input.size === null) return null;
  const from = pinOf(input.shared.fromBranch, input.pins);
  const to = pinOf(input.shared.toBranch, input.pins);
  if (from === null || to === null || from.child_location_id === to.child_location_id) return null;
  const summary = summarizeRoute(
    [
      { x: from.x, y: from.y, pin: { id: from.child_location_id, name: from.child_name } },
      { x: to.x, y: to.y, pin: { id: to.child_location_id, name: to.child_name } },
    ],
    input.scale,
    input.size,
    input.paceId,
  );
  return summary === null ? null : { summary, passing: [], roadIds: [] };
}
