import { computed, type MaybeRefOrGetter, toRaw, toValue } from "vue";
import { useEncounter } from "@/composables/encounters/useEncounters";
import { useLocation } from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { resolveBattleSurface } from "@/lib/battlemap/roomBridge";
import { terrainZonesOf } from "@/lib/battlemap/terrainZones";
import { isInteriorType } from "@/lib/locations/tiers";

/**
 * Resolves which map a location's battle view draws — the room/site surface
 * resolution `useEncounterRoom` wraps for a running encounter, factored out
 * so a caller that already has a `location_id` (the encounter builder's
 * pre-placement panel, which edits a not-yet-saved encounter and so has no
 * encounter row to read one from) can reuse the exact same resolution rather
 * than re-deriving it against only its own location's map stack (epic #868;
 * the stack itself is epic #884's `lib/locations/mapStack.ts`).
 */
export function useLocationBattleSurface(locationId: MaybeRefOrGetter<string>) {
  const { data: location, isFetched: locationFetched } = useLocation(computed(() => toValue(locationId)));

  // A room's own map (its parent site's, when it has none of its own) is
  // resolved through its parent; anything else already IS the site. Interior
  // spaces only — `isInteriorType` is the single reader of that distinction,
  // so this must never go back to comparing `location_type` inline (#886).
  //
  // The `?? ""` below is not the null-coercion this repo otherwise bans: `""`
  // is the sentinel `useLocation`'s `enabled: () => !!idRef.value` reads to
  // skip the query, so it has to stay exactly this shape rather than being
  // "fixed" into an honest absent-parent branch.
  const parentId = computed(() =>
    location.value && isInteriorType(location.value.location_type) ? (location.value.parent_id ?? "") : "",
  );
  const { data: parent, isFetched: parentFetched } = useLocation(parentId);

  const siteId = computed(() => {
    if (!location.value) return "";
    return isInteriorType(location.value.location_type)
      ? (location.value.parent_id ?? "")
      : location.value.id;
  });
  const { data: regions, isFetched: regionsFetched } = useLocationMapRegions(siteId);

  const surface = computed(() =>
    resolveBattleSurface({
      encounterLocation: location.value,
      parent: parent.value,
      regions: regions.value ?? [],
      plain: toRaw,
    }),
  );

  const mapLocation = computed(() => surface.value?.mapLocation ?? null);

  /** The room `locationId` names — only set when the battle map being shown
   *  is that room's parent site rather than a map of its own. */
  const focusRoom = computed(() =>
    surface.value?.focusRoomId && location.value?.id === surface.value.focusRoomId ? location.value : null,
  );

  const terrainZones = computed(() => terrainZonesOf(regions.value ?? [], surface.value));

  /**
   * Every read `surface` depends on has finished, so a missing surface means "no map" rather than "not yet". A read
   * that failed, or found the place gone, has finished too: waiting for data would leave the screen blank forever.
   */
  const settled = computed(() => {
    if (!locationFetched.value) return false;
    if (parentId.value && !parentFetched.value) return false;
    return !siteId.value || regionsFetched.value;
  });

  return { location, parent, siteId, regions, surface, mapLocation, focusRoom, terrainZones, settled };
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
