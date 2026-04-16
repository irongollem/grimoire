<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <template #actions>
      <DetailActions :detail-ref="detailRef" :exists="!!background" />
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <BackgroundDetail v-else ref="detailRef" :background="background ?? null" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { useBackground } from "@/composables/useBackgrounds";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DetailActions from "@/components/common/DetailActions.vue";
import BackgroundDetail from "@/components/backgrounds/BackgroundDetail.vue";

const detailRef = ref<InstanceType<typeof BackgroundDetail> | null>(null);

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
