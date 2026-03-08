<template>
  <div class="p-4 sm:p-6 max-w-7xl mx-auto">
    <PageHeader title="Encounters" description="Build and run combat encounters">
      <template #actions>
        <RouterLink
          to="/encounters/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          New Encounter
        </RouterLink>
      </template>
    </PageHeader>
    <EncounterList />
  </div>
</template>

<script setup lang="ts">
import PageHeader from "@/components/common/PageHeader.vue";
import EncounterList from "@/components/encounters/EncounterList.vue";
</script>
