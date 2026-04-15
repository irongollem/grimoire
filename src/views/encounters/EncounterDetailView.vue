<template>
  <div class="p-4 sm:p-6 max-w-7xl mx-auto">
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- Matches the #168 sheet/editor convention: new encounter or
         `?edit=true` → full editor, otherwise → read-only sheet. -->
    <EncounterDetail
      v-else-if="isNew || isEditing"
      :encounter="encounter ?? null"
    />
    <EncounterSheet
      v-else-if="encounter"
      :key="encounter.id"
      :encounter="encounter"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useEncounter } from "@/composables/useEncounters";
import EncounterDetail from "@/components/encounters/EncounterDetail.vue";
import EncounterSheet from "@/components/encounters/EncounterSheet.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const route     = useRoute();
const isNew     = computed(() => route.name === "encounter-new");
const isEditing = computed(() => route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: encounter, isLoading: encounterLoading } = useEncounter(id);
const isLoading = computed(() => !isNew.value && encounterLoading.value);
</script>
