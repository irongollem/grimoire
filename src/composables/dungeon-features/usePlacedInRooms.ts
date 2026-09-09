// The "Placed in" wiring three Dungeon Craft grids share (#868, S8, frame
// 11): every placement for a set of entities of one kind, joined against
// every location in the campaign so a room's own parent resolves to a site
// name for the reverse "Placed in" line. Traps and Features tabs key `ids`
// on the entity's own id; Puzzles keys it on a puzzle's *host feature* id
// instead (a puzzle has no `location_placements` row of its own) and layers
// `directRoomPlacement` on top locally — this composable only owns the part
// all three shared, which is what had drifted into three copies.

import { computed } from "vue";
import type { Ref } from "vue";
import { useEntityPlacementsFor } from "@/composables/locations/useLocationPlacements";
import type { LocationPlacementWithLocation } from "@/composables/locations/useLocationPlacements";
import { useAllLocations } from "@/composables/locations/useLocations";
import { resolvePlacedInRooms } from "@/lib/dungeon-features/placedIn";
import type { PlacedInRoom } from "@/lib/dungeon-features/placedIn";
import type { Location } from "@/types/location.types";
import type { LocationPlacementKind } from "@/types/locationPlacement.types";

/** The exclusive-arc column `kind` reads — a switch rather than dynamic
 *  `${kind}_id` indexing, so this stays exhaustively checked instead of
 *  relying on a template-literal key matching the row's actual fields. */
function targetIdOf(placement: LocationPlacementWithLocation, kind: LocationPlacementKind): string | null {
  switch (kind) {
    case "trap": return placement.trap_id;
    case "dungeon_feature": return placement.dungeon_feature_id;
    case "roll_table": return placement.roll_table_id;
    case "loot_table": return placement.loot_table_id;
  }
}

export function usePlacedInRooms(kind: LocationPlacementKind, ids: Ref<string[]>) {
  const { data: placements } = useEntityPlacementsFor(kind, ids);
  const { data: allLocations } = useAllLocations();
  const locationsById = computed(() => new Map<string, Location>((allLocations.value ?? []).map((l) => [l.id, l])));

  function placedInRows(entityId: string): PlacedInRoom[] {
    return resolvePlacedInRooms(
      (placements.value ?? []).filter((p) => targetIdOf(p, kind) === entityId),
      locationsById.value,
    );
  }

  return { placedInRows, locationsById };
}
