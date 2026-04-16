<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <template v-if="isNew || isEditing" #actions>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
        @click="onCancel"
      >
        Cancel
      </button>
      <DetailActions :detail-ref="detailRef" :exists="!!species" />
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <SpeciesDetail v-else-if="isNew || isEditing" ref="detailRef" :species="species ?? null" />
    <SpeciesSheet v-else-if="species" :species="species" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSpecies } from "@/composables/useSpecies";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DetailActions from "@/components/common/DetailActions.vue";
import SpeciesDetail from "@/components/species/SpeciesDetail.vue";
import SpeciesSheet from "@/components/species/SpeciesSheet.vue";

const detailRef = ref<InstanceType<typeof SpeciesDetail> | null>(null);

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "species-new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: species, isLoading } = useSpecies(id);
const loading = computed(() => !isNew.value && isLoading.value);

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

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}
</script>
