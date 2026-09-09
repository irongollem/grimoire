import { computed, type MaybeRefOrGetter } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import { useEncounterRoom } from "@/composables/encounters/useEncounterRoom";
import { useAssertLocationState } from "@/composables/locations/useLocationState";
import { decodeFogMask } from "@/lib/battlemap/fogMask";
import { roomsRevealedInCombat, type BattleSurface } from "@/lib/battlemap/roomBridge";
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
    // Check map_url first: a room can carry its own uncalibrated map even
    // while its site's plan is also uncalibrated, and that needs
    // "calibrate", not "no map of its own" — the room does have one.
    if (location.location_type === "room") {
      return {
        canOpen: false,
        reason: location.map_url
          ? "This room's map needs calibrating first"
          : "This room has no map of its own, and its site isn't calibrated either",
      };
    }
    return {
      canOpen: false,
      reason: location.map_url ? "Calibrate the location's map first" : "The linked location has no map",
    };
  }

  if (surface.focusRoomId === null && !surface.mapLocation.is_battle_map) {
    return { canOpen: false, reason: 'Toggle "Battle map" on the location to enable the VTT' };
  }
  return { canOpen: true, reason: "" };
}

/**
 * Battle-map gating and end-of-combat room exploration for the DM's runner
 * (epic #868). Shares `useEncounterRoom`'s resolution of which surface an
 * encounter opens on — the same one `EncounterMapView` renders — so the
 * runner's gate and the map view's render can never disagree.
 */
export function useCombatExploration(encounterId: MaybeRefOrGetter<string>) {
  const { encounter, location, surface, regions } = useEncounterRoom(encounterId);
  const { confirm } = useConfirm();
  const { mutateAsync: assertLocationState } = useAssertLocationState();

  const gate = computed(() =>
    resolveBattleMapGate({
      hasLocationId: !!encounter.value?.location_id,
      location: location.value,
      surface: surface.value,
    }),
  );
  const canOpenBattleMap = computed(() => gate.value.canOpen);
  const battleMapDisabledReason = computed(() => gate.value.reason);

  /**
   * One prompt for every room the party actually saw this fight, not a
   * per-room decision (frame 16). Never the reverse — un-brushing a cell
   * never un-explores a room. No-op when the encounter has no focus room, or
   * fog was never pushed (fresh lobby, ended before going live).
   */
  async function markRoomsExploredFromFogMask(fogMaskAtEnd: string | null): Promise<void> {
    const s = surface.value;
    if (!s?.focusRoomId || !fogMaskAtEnd) return;
    const revealedRoomIds = roomsRevealedInCombat(decodeFogMask(fogMaskAtEnd), regions.value ?? [], s.calibration);
    if (revealedRoomIds.length === 0) return;
    const confirmed = await confirm(
      `Mark ${revealedRoomIds.length} room${revealedRoomIds.length === 1 ? "" : "s"} revealed in combat as explored?`,
      { danger: false, confirmLabel: "Mark explored" },
    );
    if (!confirmed) return;
    await Promise.all(
      revealedRoomIds.map((locationId) =>
        assertLocationState({ location_id: locationId, fact: "explored", value: true, note: "revealed in combat" }),
      ),
    );
  }

  return { canOpenBattleMap, battleMapDisabledReason, markRoomsExploredFromFogMask };
}
