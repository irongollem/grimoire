import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useEncounter } from "@/composables/encounters/useEncounters";
import { useLocation } from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { regionCellToBattleCell, resolveBattleSurface } from "@/lib/battlemap/roomBridge";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

/**
 * Resolves which map a location's battle view draws — the room/site surface
 * resolution `useEncounterRoom` wraps for a running encounter, factored out
 * so a caller that already has a `location_id` (the encounter builder's
 * pre-placement panel, which edits a not-yet-saved encounter and so has no
 * encounter row to read one from) can reuse the exact same resolution rather
 * than re-deriving it against only its own location's `map_url` (epic #868).
 */
export function useLocationBattleSurface(locationId: MaybeRefOrGetter<string>) {
  const { data: location } = useLocation(computed(() => toValue(locationId)));

  // A room's own map (its parent site's, when it has none of its own) is
  // resolved through its parent; anything else already IS the site.
  const parentId = computed(() =>
    location.value?.location_type === "room" ? (location.value.parent_id ?? "") : "",
  );
  const { data: parent } = useLocation(parentId);

  const siteId = computed(() => {
    if (!location.value) return "";
    return location.value.location_type === "room" ? (location.value.parent_id ?? "") : location.value.id;
  });
  const { data: regions } = useLocationMapRegions(siteId);

  const surface = computed(() =>
    resolveBattleSurface({
      encounterLocation: location.value,
      parent: parent.value,
      regions: regions.value ?? [],
    }),
  );

  const mapLocation = computed(() => surface.value?.mapLocation ?? null);

  /** The room `locationId` names — only set when the battle map being shown
   *  is that room's parent site rather than a map of its own. */
  const focusRoom = computed(() =>
    surface.value?.focusRoomId && location.value?.id === surface.value.focusRoomId ? location.value : null,
  );

  /** Terrain zones (difficult ground etc.) whose cells fall inside the focus
   *  room — a zone binds to nothing by rule, so this is a spatial filter, not
   *  a lookup by room id. Whole-map view (no focus room) shows none, since
   *  there is nothing to focus around. */
  const terrainZones = computed(() => {
    const s = surface.value;
    if (!s || s.focusCells.length === 0) return [];
    const focusSet = new Set(s.focusCells);
    const zones: { region: LocationMapRegion; battleCells: string[] }[] = [];
    for (const region of regions.value ?? []) {
      if (region.region_role !== "zone") continue;
      if ((region.zone_payload.movement_cost ?? 1) <= 1) continue;
      const battleCells = region.cells.map((c) => regionCellToBattleCell(c, s.calibration));
      if (battleCells.some((c) => focusSet.has(c))) zones.push({ region, battleCells });
    }
    return zones;
  });

  return { location, parent, siteId, regions, surface, mapLocation, focusRoom, terrainZones };
}

/**
 * Resolves the two views onto a single encounter's battle map — the runner's
 * gate and the map view's render — from one place, so they can't disagree
 * about which location's map is on screen or which cells are the focus room
 * (epic #868, frame 13).
 */
export function useEncounterRoom(encounterId: MaybeRefOrGetter<string>) {
  const { data: encounter } = useEncounter(computed(() => toValue(encounterId)));
  const locationId = computed(() => encounter.value?.location_id ?? "");
  const surface = useLocationBattleSurface(locationId);
  return { encounter, ...surface };
}
