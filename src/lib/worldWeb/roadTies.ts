/**
 * Roads as ties of the World web (#1222, story 1b).
 *
 * A road is its own row between two places (`location_roads`), not a link: the web draws it as the line between
 * the two and holds no copy (the maintainer, 18 Nov 2026: "the world web may still read the road join table as
 * data for setting the relation line's data"). So these ties are made here from the roads each time they are
 * read, and are changed where a road is changed: on either place's entry, never from the web.
 */
import { roadText, type Road } from "@/lib/travel/roads";
import type { WorldTie } from "./ties";

export interface RoadEnd {
  name: string;
  image: string | null;
}

/** One tie per road whose two places are both known. A road to a place that is not in `places` is not drawn. */
export function roadTies(roads: readonly Road[], places: ReadonlyMap<string, RoadEnd>): WorldTie[] {
  return roads.flatMap((road): WorldTie[] => {
    const from = places.get(road.from_location_id);
    const to = places.get(road.to_location_id);
    if (from === undefined || to === undefined) return [];
    return [
      {
        source: "road",
        row_id: road.id,
        type: "road",
        from_kind: "location",
        from_id: road.from_location_id,
        from_name: from.name,
        from_image: from.image,
        to_kind: "location",
        to_id: road.to_location_id,
        to_name: to.name,
        to_image: to.image,
        // How far and by what: "40 mi by the coast road". The web shows it under the place's name.
        told: roadText(road),
        role: null,
        status: null,
      },
    ];
  });
}
