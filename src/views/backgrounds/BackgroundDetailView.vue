<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <template v-if="isNew || isEditing" #actions>
      <AppButton v-if="!isNew" variant="subtle" size="md" label="Cancel" @click="onCancel" />
      <DetailActions :detail-ref="detailRef" :exists="!!background" />
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <BackgroundDetail v-else-if="isNew || isEditing" ref="detailRef" :background="background ?? null" />
    <BackgroundSheet v-else-if="background" :background="background" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useBackground } from "@/composables/rules/useBackgrounds";
import AppButton from "@/components/common/AppButton.vue";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DetailActions from "@/components/common/DetailActions.vue";
import BackgroundDetail from "@/components/backgrounds/BackgroundDetail.vue";
import BackgroundSheet from "@/components/backgrounds/BackgroundSheet.vue";

const detailRef = ref<InstanceType<typeof BackgroundDetail> | null>(null);

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "background-new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: background, isLoading } = useBackground(id);
const loading = computed(() => !isNew.value && isLoading.value);

const pageTitle = computed(() => {
  if (isNew.value) return "New Background";
  return background.value?.name ?? "Loading…";
});

const pageDescription = computed(() => {
  const b = background.value;
  if (!b) return "";
  return b.feature_name ?? b.source_title ?? b.source ?? "";
});

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}
</script>
