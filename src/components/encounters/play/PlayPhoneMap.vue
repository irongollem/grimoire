<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1">
      <PlayMap
        ref="map"
        :encounter-id="encounterId"
        :view="DEFAULT_PLAY_VIEW"
        :placing-id="placingId"
        @unplaced="unplaced = $event"
        @rooms="rooms = $event"
        @placed="placingId = null"
        @cancel-placing="placingId = null"
      />
    </div>
    <!-- No drag on a phone: tap a portrait, then tap a square. -->
    <div class="max-h-36 shrink-0 overflow-y-auto bg-card">
      <PlayUnplacedTray
        :combatants="unplaced"
        :factions="store.factions"
        :armed-id="placingId"
        :rooms="rooms"
        @arm="placingId = $event"
        @scatter="map?.scatterInRoom($event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import PlayMap from "./PlayMap.vue";
import PlayUnplacedTray from "./PlayUnplacedTray.vue";
import { DEFAULT_PLAY_VIEW } from "./playTypes";

/** The phone runner's Map tab: the same map and toolbelt as the Play screen, full width. */
defineProps<{ encounterId: string }>();

const store = useEncounterRunStore();
const unplaced = ref<RunCombatant[]>([]);
const rooms = ref<{ id: string; name: string }[]>([]);
const placingId = ref<string | null>(null);
const map = ref<InstanceType<typeof PlayMap> | null>(null);
</script>
