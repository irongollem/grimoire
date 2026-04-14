<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <BackgroundDetail v-else :background="background ?? null" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useBackground } from "@/composables/useBackgrounds";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import BackgroundDetail from "@/components/backgrounds/BackgroundDetail.vue";

const route = useRoute();

const isNew = computed(() => route.name === "background-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: background, isLoading } = useBackground(id);

const pageTitle = computed(() => {
  if (isNew.value) return "New Background";
  return background.value?.name ?? "Loading…";
});

const pageDescription = computed(() => {
  const b = background.value;
  if (!b) return "";
  return b.feature_name ?? b.source_title ?? b.source ?? "";
});
</script>
