<template>
  <!-- A map and nothing else: the parent gives it a box and it fills it. -->
  <div v-if="hasMap" class="size-full overflow-hidden" data-testid="solo-place-map">
    <ExploreMap
      v-if="surface"
      :surface="surface"
      :tokens="tokens"
      :rooms="roomLabels"
      :entering-cells="[]"
      :fog-mask="fogMask"
      :fog-seen="sight"
      :door-states="doorStates"
      :view="VIEW"
      as-player
      :selected-id="selectedId"
      @move="onMove"
      @frame="frame = $event"
    />
    <div v-else-if="planShown" class="size-full overflow-y-auto" data-testid="solo-place-plan">
      <LocationMap
        :stack="mapStack"
        :children="[]"
        :pins="[]"
        mode="view"
        :show-layer-bar="false"
        show-regions
        :regions="regions"
        :spaces="spaces"
        run-mode
        :party-room-id="currentRoomId"
        :reachable-room-ids="reachable"
        show-fog
        :fog-glimpsed="fogGlimpsed"
        @move-party="chooseRoom"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import ExploreMap from "@/components/locations/explore/ExploreMap.vue";
import LocationMap from "@/components/locations/map/LocationMap.vue";
import { DEFAULT_PLAY_VIEW, type PlayViewState } from "@/components/encounters/play/playTypes";
import { useSoloPlaceMap } from "@/composables/table/useSoloPlaceMap";
import type { PartyMember } from "@/types/party.types";

/**
 * The map above the story while there is no fight (Solo Table frame 03): the place the party is in, the played
 * character's token on it, fogged by what they have seen. It moves nothing itself: choosing another room is handed up
 * as `go` and the story moves the party. See `useSoloPlaceMap`.
 */
const { placeId, member, busy } = defineProps<{
  /** The place the party is in right now, as the story has it. */
  placeId: string | null;
  /** The character being played. */
  member: PartyMember;
  /** A turn is being answered: nothing on the map can be acted on. */
  busy: boolean;
}>();

const emit = defineEmits<{
  /** The player chose another room on the map. */
  go: [place: { id: string; name: string }];
  /** Whether there is a map to show; sent once it is known, and again when it changes. */
  "has-map": [shown: boolean];
}>();

// Room names on, as on the exploring screen; the fog is drawn from the mask whatever this says.
const VIEW: PlayViewState = { ...DEFAULT_PLAY_VIEW, showZones: true };

const { hasMap, surface, planShown, mapStack, regions, spaces, currentRoomId, reachable, fogGlimpsed, tokens, selectedId, roomLabels, fogMask, sight, doorStates, frame, onMove, chooseRoom } =
  useSoloPlaceMap({
    placeId: () => placeId,
    member: () => member,
    busy: () => busy,
    onGo: (place) => emit("go", place),
  });

watch(hasMap, (shown) => {
  if (shown !== null) emit("has-map", shown);
}, { immediate: true });
</script>
