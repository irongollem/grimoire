<template>
  <MapTableFight v-if="fightId" :key="fightId" :encounter-id="fightId" />
  <MapTableExplore v-else :place-id="placeId" />
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
import MapTableFight from "@/components/table/MapTableFight.vue";
import { useEncounterRoom, useLocationBattleSurface } from "@/composables/encounters/useEncounterRoom";
import { useRunningEncounters } from "@/composables/encounters/useEncounterLive";
import { useAppUiStore } from "@/stores/ui/app";

const route = useRoute();
const placeId = computed(() => route.params.id as string);

// A campaign runs one encounter at a time; its map place is the site for a fight in a room, else its own place.
const { firstRunning } = useRunningEncounters();
const runningId = computed(() => firstRunning.value?.encounter_id ?? "");
const { surface: fightSurface } = useEncounterRoom(runningId);
const { surface: thisSurface } = useLocationBattleSurface(placeId);

const fightId = computed(() => {
  const there = fightSurface.value?.mapLocation.id;
  return runningId.value && there && there === thisSurface.value?.mapLocation.id ? runningId.value : null;
});

// Chromeless, like the Scriptorium: no sidebar or top bar on a screen the table looks at.
const appUi = useAppUiStore();
onMounted(() => {
  appUi.editorFocus = true;
});
onBeforeUnmount(() => {
  appUi.editorFocus = false;
});
</script>
