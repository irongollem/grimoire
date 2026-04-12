<template>
  <PageHeader :title="pageTitle">
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <FeatureDetail v-else :feature="feature ?? null" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useFeature } from "@/composables/useFeatures";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FeatureDetail from "@/components/features/FeatureDetail.vue";

const route = useRoute();
const isNew = computed(() => route.name === "feature-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: feature, isLoading } = useFeature(id);

const pageTitle = computed(() => {
  if (isNew.value) return "New Ability";
  return feature.value?.name ?? "Loading…";
});
</script>
