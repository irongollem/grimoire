<template>
  <MobileSheet v-model:open="open" title="Combat tools">
    <RunnerToolsContent :encounter-id="encounterId" :selected-trap-id="selectedTrapId" @update:selected-trap-id="onPickTrap" />
  </MobileSheet>
</template>

<script setup lang="ts">
/**
 * The phone's bottom sheet around RunnerToolsContent. Picking a trap closes the sheet so its
 * detail is what the DM sees next.
 */
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
import RunnerToolsContent from "./RunnerToolsContent.vue";

defineProps<{ encounterId: string; selectedTrapId: string | null }>();
const emit = defineEmits<{ "update:selectedTrapId": [id: string | null] }>();
const open = defineModel<boolean>("open", { required: true });

function onPickTrap(id: string | null) {
  emit("update:selectedTrapId", id);
  if (id !== null) open.value = false;
}
</script>
