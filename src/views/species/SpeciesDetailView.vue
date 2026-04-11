<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <SpeciesDetail v-else :species="species ?? null" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useSpecies } from "@/composables/useSpecies";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SpeciesDetail from "@/components/species/SpeciesDetail.vue";

const route = useRoute();

const isNew = computed(() => route.name === "species-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: species, isLoading } = useSpecies(id);

const pageTitle = computed(() => {
  if (isNew.value) return "New Species";
  return species.value?.name ?? "Loading…";
});

const pageDescription = computed(() => {
  const s = species.value;
  if (!s) return "";
  const parts = [];
  if (s.size) parts.push(s.size.charAt(0).toUpperCase() + s.size.slice(1));
  if (s.source) parts.push(s.source);
  return parts.join(" · ");
});
</script>
