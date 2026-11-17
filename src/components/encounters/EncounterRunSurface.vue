<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="openError" class="flex flex-col items-center gap-3 py-16 text-center" role="alert">
      <p class="text-body text-muted-foreground">Couldn't open this fight. {{ openError }}</p>
      <AppButton variant="outline" size="sm" label="Try again" @click="retryOpen" />
    </div>
    <div v-else-if="!opened" class="flex justify-center py-16"><LoadingSpinner /></div>
    <EncounterRunner v-else />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useOpenRun } from "@/composables/encounters/useOpenRun";
import { useSoloFight } from "@/composables/table/useSoloFight";
import AppButton from "@/components/common/controls/AppButton.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import EncounterRunner from "@/components/encounters/EncounterRunner.vue";

const props = defineProps<{ encounterId: string }>();
const id = computed(() => props.encounterId);
const solo = useSoloFight();
const { opened, openError, retry: retryOpen } = useOpenRun(id, { onlyMemberId: () => solo.value?.memberId ?? null });
</script>
