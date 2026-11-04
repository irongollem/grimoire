<template>
  <div class="flex flex-col gap-4 pb-4">
    <RunnerSurprisePanel v-if="!store.started" />

    <RunnerBossMechanics v-if="withBoss" />

    <RunnerDmTools
      layout="stack"
      :selected-trap-id="selectedTrapId"
      @update:selected-trap-id="emit('update:selectedTrapId', $event)"
    />

    <RunnerSpawnPanel />

    <DmNoteBox type="encounter" :id="encounterId" :label="store.encounterName" />
  </div>
</template>

<script setup lang="ts">
/**
 * What the runner keeps off the main page so the list (phone) or the map (Play) can have the
 * room: surprise, lair and legendary mechanics, events + hazards + traps, spawning, and the DM's
 * note on the encounter. The phone's bottom sheet and the Play screen's side sheet both wrap it.
 */
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import RunnerBossMechanics from "./RunnerBossMechanics.vue";
import RunnerDmTools from "./RunnerDmTools.vue";
import RunnerSpawnPanel from "./RunnerSpawnPanel.vue";
import RunnerSurprisePanel from "./RunnerSurprisePanel.vue";

defineProps<{
  encounterId: string;
  selectedTrapId: string | null;
  /** The phone shows boss mechanics above its list; the Play screen has no list to put them over. */
  withBoss?: boolean;
}>();
const emit = defineEmits<{ "update:selectedTrapId": [id: string | null] }>();

const store = useEncounterRunStore();
</script>
