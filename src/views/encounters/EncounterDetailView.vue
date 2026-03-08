<template>
  <div class="p-4 sm:p-6 max-w-7xl mx-auto">
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <EncounterDetail v-else :encounter="encounter ?? null" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useEncounter } from "@/composables/useEncounters";
import EncounterDetail from "@/components/encounters/EncounterDetail.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const route = useRoute();
const id = computed(() => route.params.id as string);
const { data: encounter, isLoading } = useEncounter(id);
</script>
