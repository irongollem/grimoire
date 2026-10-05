<template>
  <PageHeader :title="pageTitle" :description="description">
    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <FeatureDetail
      v-else-if="isNew || (isEditing && canEdit)"
      :key="feature?.id ?? 'new'"
      :feature="feature ?? null"
      :new-kind="newKind"
    />
    <FeatureSheet v-else-if="feature" :feature="feature" :can-edit="canEdit" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useFeature } from "@/composables/rules/useFeatures";
import { useAuthStore } from "@/stores/auth";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FeatureDetail from "@/components/features/FeatureDetail.vue";
import FeatureSheet from "@/components/features/FeatureSheet.vue";
import type { FeatureKind } from "@/rules/features/mechanics.types";

const route = useRoute();
const auth = useAuthStore();

const isNew = computed(() => route.name === "feature-new" || route.name === "feat-new");
const newKind = computed<FeatureKind>(() => (route.name === "feat-new" ? "feat" : "feature"));
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: feature, isLoading } = useFeature(id);
const loading = computed(() => !isNew.value && isLoading.value);

// An official row (no owner) is everyone's to read and only the admin's to change.
const canEdit = computed(() => !feature.value || feature.value.user_id !== null || auth.isAppAdmin);

const kind = computed<FeatureKind>(() => feature.value?.kind ?? newKind.value);
const noun = computed(() => (kind.value === "feat" ? "Feat" : "Ability"));

const pageTitle = computed(() => {
  if (isNew.value) return `New ${noun.value}`;
  return feature.value?.name ?? "Loading…";
});
const description = computed(() =>
  kind.value === "feat"
    ? "A feat a character can take, with the conditions and mechanics the app reads"
    : "Define a class feature, racial trait, or background ability",
);
</script>
