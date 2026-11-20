import { computed, onScopeDispose, toValue, type MaybeRefOrGetter } from "vue";
import type { useEncounterRoom } from "@/composables/encounters/useEncounterRoom";
import { usePartySight, type SightToken } from "@/composables/encounters/usePartySight";
import { useMapDoors } from "@/composables/locations/useMapDoors";
import { useMapMemory } from "@/composables/locations/useMapMemory";
import { useRememberSight } from "@/composables/locations/useRememberSight";
import { imageGrid, type MapGrid } from "@/lib/battlemap/imageGrid";
import type { DarknessZone } from "@/lib/battlemap/illumination";
import { occludersOf } from "@/lib/battlemap/occlusion";
import { useCampaignStore } from "@/stores/campaign";
import { useEncounterRunStore } from "@/stores/encounterRun";

type FightSurface = ReturnType<typeof useEncounterRoom>["surface"]["value"];

/**
 * What every screen that draws a fight's map reads about the map itself (epic #1133, "the map is the table"): the
 * picture's grid, the map's memory and door states (both belong to the map, per campaign and place, shared by
 * exploring and every fight on it), the squares the party sees now, the walls and doors that block that sight, and
 * the writing of what is seen into memory. The Dungeon Master's Play screen and the played character's solo map both
 * assemble the fight's map from these pieces; what each shows or lets you do with them stays with the caller.
 */
export function useFightMapSight(opts: {
  surface: MaybeRefOrGetter<FightSurface>;
  /** The map picture's natural size once known; the grid, and so sight, is null until then. */
  imageSize: MaybeRefOrGetter<{ w: number; h: number } | null>;
  /** Magical darkness on the map: the DM's mirror, or the live row's. */
  zones: MaybeRefOrGetter<readonly DarknessZone[]>;
  /** The tokens that look. Which ones is the caller's decision (every placed token, or the played one's own view). */
  tokens: MaybeRefOrGetter<readonly SightToken[]>;
  /** When set, only this token looks (a player who sees what their character sees). */
  onlyInstanceId?: MaybeRefOrGetter<string | null>;
  /**
   * Whether this window may write what is seen into the map's memory. Only the DM's controlling window passes true
   * for the party; a follower writes nothing. The campaign and place being known is checked here.
   */
  mayRemember: MaybeRefOrGetter<boolean>;
}) {
  const campaign = useCampaignStore();
  const store = useEncounterRunStore();
  const surface = computed(() => toValue(opts.surface));
  const campaignId = () => campaign.activeCampaign?.id ?? null;
  const placeId = () => surface.value?.mapLocation.id ?? null;

  const memory = useMapMemory(campaignId, placeId);
  // A door's play state is the map's, like the fog (#1134): exploring and every fight on this map share it, live or not.
  const { doorStates, setDoor } = useMapDoors(campaignId, placeId);

  const grid = computed<MapGrid | null>(() => imageGrid(surface.value?.calibration.cells_per_image_width, toValue(opts.imageSize)));

  const { viewers, sight } = usePartySight({
    live: () => surface.value?.live ?? null,
    doorStates,
    zones: opts.zones,
    tokens: opts.tokens,
    grid,
    onlyInstanceId: opts.onlyInstanceId,
  });
  useRememberSight({
    memory,
    sight,
    enabled: () => toValue(opts.mayRemember) && !!campaignId() && !!placeId(),
  });

  /** The walls, doors and rock that block sight and walking, as the party left the doors; null with no drawn live map. */
  const occluders = computed(() => {
    const live = surface.value?.live;
    return live ? occludersOf(live, doorStates.value) : null;
  });
  // The attack flows beside the map read the walls from the store (a foe behind a wall is not beside an archer).
  store.setOccluders(() => occluders.value);
  onScopeDispose(() => store.setOccluders(null));

  return { memory, doorStates, setDoor, grid, viewers, sight, occluders };
}
