<template>
  <PageHeader :title="pageTitle" description="Define a class feature, racial trait, or background ability">
    <template v-if="isNew || isEditing" #actions>
      <AppButton v-if="!isNew" variant="subtle" size="md" label="Cancel" @click="onCancel" />
      <DetailActions :detail-ref="detailRef" :exists="!!feature" />
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <FeatureDetail v-else-if="isNew || isEditing" ref="detailRef" :feature="feature ?? null" />
    <FeatureSheet v-else-if="feature" :feature="feature" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useFeature } from "@/composables/rules/useFeatures";
import AppButton from "@/components/common/AppButton.vue";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DetailActions from "@/components/common/DetailActions.vue";
import FeatureDetail from "@/components/features/FeatureDetail.vue";
import FeatureSheet from "@/components/features/FeatureSheet.vue";

const detailRef = ref<InstanceType<typeof FeatureDetail> | null>(null);

const route = useRoute();
const router = useRouter();
const isNew = computed(() => route.name === "feature-new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: feature, isLoading } = useFeature(id);
const loading = computed(() => !isNew.value && isLoading.value);

const pageTitle = computed(() => {
  if (isNew.value) return "New Ability";
  return feature.value?.name ?? "Loading…";
});

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}
</script>
