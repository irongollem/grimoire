import type { MapPin } from "@/types/location.types";
import { roadText, type Road } from "./roads";

/**
 * The roads a map knows, drawn between its pins (#1222, story 10).
 *
 * A known road is a straight line between its two pins; the picture's own paths are not traced. A road's end
 * stands on this map at its own pin or, failing that, at the pin of the nearest place it lies inside (a road to a
 * hamlet inside a town ends at the town's pin), the same rule the straight-line journey uses (`mapLine.pinOf`).
 */

export interface MapRoadLine {
  roadId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  /**
   * Where along the line the label sits, 0 to 1. Midway, unless several roads join the same two pins: they
   * overlap, so their labels are staggered along the line rather than stacked on one spot.
   */
  labelAt: number;
}

function pinOf(placeId: string, pins: readonly MapPin[], parentOf: (id: string) => string | null): MapPin | null {
  const seen = new Set<string>();
  for (let at: string | null = placeId; at !== null && !seen.has(at); at = parentOf(at)) {
    seen.add(at);
    const pin = pins.find((p) => p.child_location_id === at);
    if (pin) return pin;
  }
  return null;
}

export function mapRoadLines(input: {
  pins: readonly MapPin[];
  roads: readonly Road[];
  parentOf: (id: string) => string | null;
}): MapRoadLine[] {
  const found: Array<{ road: Road; from: MapPin; to: MapPin; pair: string }> = [];
  for (const road of input.roads) {
    const from = pinOf(road.from_location_id, input.pins, input.parentOf);
    const to = pinOf(road.to_location_id, input.pins, input.parentOf);
    if (from === null || to === null || from.child_location_id === to.child_location_id) continue;
    const pair = [from.child_location_id, to.child_location_id].sort().join("|");
    found.push({ road, from, to, pair });
  }
  const perPair = new Map<string, number>();
  for (const f of found) perPair.set(f.pair, (perPair.get(f.pair) ?? 0) + 1);
  const placed = new Map<string, number>();
  return found.map(({ road, from, to, pair }) => {
    const total = perPair.get(pair) ?? 1;
    const nth = placed.get(pair) ?? 0;
    placed.set(pair, nth + 1);
    return {
      roadId: road.id,
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      label: roadText(road),
      labelAt: total === 1 ? 0.5 : (nth + 1) / (total + 1),
    };
  });
}
