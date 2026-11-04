import { computed, type MaybeRefOrGetter } from "vue";
import { useEncounterRoom } from "@/composables/encounters/useEncounterRoom";
import type { BattleSurface } from "@/lib/battlemap/roomBridge";
import { hasAnyMapLayer } from "@/lib/locations/mapStack";
import { isInteriorType } from "@/lib/locations/tiers";
import type { Location } from "@/types/location.types";

/**
 * Can this encounter's battle map be opened right now, and if not, why? A
 * room rides its site's own publish — already a legal battle map at combat's
 * cell scale (frame 13) — so only a plain, non-room-anchored map still needs
 * the explicit "Battle map" flag that hides tactical art from players.
 *
 * Pure and exported standalone (no Vue, no composable) so the branching —
 * moved out of EncounterRunner, which had grown past its line cap — is
 * testable without mounting anything.
 */
export function resolveBattleMapGate(params: {
  hasLocationId: boolean;
  location: Location | null | undefined;
  surface: BattleSurface | null | undefined;
}): { canOpen: boolean; reason: string } {
  const { hasLocationId, location, surface } = params;
  if (!hasLocationId) {
    return { canOpen: false, reason: "Link this encounter to a location to use the battle map" };
  }
  if (!location) return { canOpen: false, reason: "" };

  if (!surface) {
    // Check the map stack first: an interior space (room or grounds — #886)
    // can carry its own uncalibrated Picture or Drawing even while its
    // site's plan is also uncalibrated, and that needs "calibrate", not "no
    // map of its own" — the room does have one. `isInteriorType` is the
    // single reader of that distinction.
    if (isInteriorType(location.location_type)) {
      return {
        canOpen: false,
        reason: hasAnyMapLayer(location)
          ? "This room's map needs its grid lined up first"
          : "This room has no map of its own, and its site's map has no grid either",
      };
    }
    return {
      canOpen: false,
      reason: hasAnyMapLayer(location) ? "Line up the grid on this place's map first" : "The linked location has no map",
    };
  }

  if (surface.focusRoomId === null && !surface.mapLocation.is_battle_map) {
    return { canOpen: false, reason: 'Toggle "Battle map" on the location to enable the VTT' };
  }
  return { canOpen: true, reason: "" };
}

/**
 * Battle-map gating for the DM's runner (epic #868), and the place whose map the Play screen draws. Shares
 * `useEncounterRoom`'s resolution of which surface an encounter opens on, the same one the Play map renders, so the
 * runner's gate and the map's render can never disagree. Rooms are marked Explored as a party token enters them, live
 * (#1133), so nothing is reconciled when a fight ends.
 */
export function useCombatExploration(encounterId: MaybeRefOrGetter<string>) {
  const { encounter, location, surface } = useEncounterRoom(encounterId);

  const gate = computed(() =>
    resolveBattleMapGate({
      hasLocationId: !!encounter.value?.location_id,
      location: location.value,
      surface: surface.value,
    }),
  );
  const canOpenBattleMap = computed(() => gate.value.canOpen);
  const battleMapDisabledReason = computed(() => gate.value.reason);
  /** The place whose map is drawn (the site for a fight in a room), the one Table screen this fight shows on. */
  const mapPlaceId = computed(() => surface.value?.mapLocation.id ?? null);

  return { canOpenBattleMap, battleMapDisabledReason, mapPlaceId };
}
