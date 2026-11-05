<template>
  <MapTableFight v-if="fightId" :key="fightId" :encounter-id="fightId" />
  <div v-else class="relative h-dvh w-screen bg-black">
    <Transition v-if="surfaceSettled" :name="crossfade ? 'table-fade' : ''">
      <MapTablePicture v-if="showPicture" key="picture" :place-id="placeId" class="absolute inset-0" />
      <MapTableExplore v-else key="map" :place-id="placeId" class="absolute inset-0" />
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * One Table screen per map (epic #1133 decision 6), open on the TV for the whole session. It follows the party while
 * they explore and shows a fight on this map (ribbon, monsters, whose turn) while one is live, then goes back to
 * exploring: the switch is the campaign's running encounter appearing on, or leaving, this map. It never writes.
 */
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute } from "vue-router";
import MapTableExplore from "@/components/table/MapTableExplore.vue";
import MapTablePicture from "@/components/table/MapTablePicture.vue";
import MapTableFight from "@/components/table/MapTableFight.vue";
import { useEncounterRoom, useLocationBattleSurface } from "@/composables/encounters/useEncounterRoom";
import { useRunningEncounters } from "@/composables/encounters/useEncounterLive";
import { useTableShows } from "@/composables/bookNook/useTableShows";
import { useLocation } from "@/composables/locations/useLocations";
import { prefersReducedMotion } from "@/lib/motion";
import { useAppUiStore } from "@/stores/ui/app";

const route = useRoute();
const placeId = computed(() => route.params.id as string);

// A campaign runs one encounter at a time; its map place is the site for a fight in a room, else its own place.
const { firstRunning } = useRunningEncounters();
const runningId = computed(() => firstRunning.value?.encounter_id ?? "");
const { surface: fightSurface } = useEncounterRoom(runningId);
const { surface: thisSurface, settled: surfaceSettled } = useLocationBattleSurface(placeId);

const fightId = computed(() => {
  const there = fightSurface.value?.mapLocation.id;
  return runningId.value && there && there === thisSurface.value?.mapLocation.id ? runningId.value : null;
});

// The living picture (#1142): shown when this place has one and either there is no map to play on or the DM chose
// Picture. A fight is decided above and always shows the map. Picture and map never draw together; they crossfade.
// Nothing is chosen until the map's reads have answered: a TV must not flash the picture while a map is loading.
const { data: place } = useLocation(placeId);
const { tableShows } = useTableShows();
const showPicture = computed(() => !!place.value?.book_nook_id && (!thisSurface.value || tableShows.value === "picture"));
const crossfade = !prefersReducedMotion();

// Chromeless, like the Scriptorium: no sidebar or top bar on a screen the table looks at.
const appUi = useAppUiStore();
onMounted(() => {
  appUi.editorFocus = true;
});
onBeforeUnmount(() => {
  appUi.editorFocus = false;
});
</script>

<style scoped>
/* Both layers are absolute and stacked; the outgoing one cannot be touched while it fades. */
.table-fade-enter-active,
.table-fade-leave-active {
  transition: opacity 0.6s ease;
}
.table-fade-leave-active {
  pointer-events: none;
}
.table-fade-enter-from,
.table-fade-leave-to {
  opacity: 0;
}
</style>
