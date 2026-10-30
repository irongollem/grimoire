<template>
  <MobileSheet v-model:open="open" title="Combat tools">
    <div class="flex flex-col gap-4 pb-4">
      <RunnerSurprisePanel v-if="!store.started" />

      <RunnerDmTools
        layout="stack"
        :selected-trap-id="selectedTrapId"
        @update:selected-trap-id="onPickTrap"
      />

      <RunnerSpawnPanel />

      <DmNoteBox type="encounter" :id="encounterId" :label="store.encounterName" />
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
/**
 * What the phone's page leaves out so the list can have the screen: surprise,
 * events + hazards + traps, spawning, and the DM's note on the encounter.
 * Picking a trap closes the sheet so its detail is what the DM sees next.
 */
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import RunnerDmTools from "./RunnerDmTools.vue";
import RunnerSpawnPanel from "./RunnerSpawnPanel.vue";
import RunnerSurprisePanel from "./RunnerSurprisePanel.vue";

defineProps<{ encounterId: string; selectedTrapId: string | null }>();
const emit = defineEmits<{ "update:selectedTrapId": [id: string | null] }>();
const open = defineModel<boolean>("open", { required: true });

const store = useEncounterRunStore();

function onPickTrap(id: string | null) {
  emit("update:selectedTrapId", id);
  if (id !== null) open.value = false;
}
</script>
