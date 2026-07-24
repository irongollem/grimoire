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
    <template v-else-if="isSrd && species" #actions>
      <PageHeaderAction
        type="button"
        :disabled="cloning"
        :label="cloning ? 'Copying…' : 'Clone to customize'"
        :icon="IconCopy"
        variant="primary"
        @click="onClone"
      />
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <SpeciesDetail v-else-if="isNew || isEditing" ref="detailRef" :species="species ?? null" />
    <SpeciesSheet v-else-if="species" :species="species" :is-srd="isSrd" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconCopy } from '@/lib/icons';
import { useSpecies, useIsSrdSpecies, useCloneSrdSpecies } from "@/composables/useSpecies";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DetailActions from "@/components/common/DetailActions.vue";
import SpeciesDetail from "@/components/species/SpeciesDetail.vue";
import SpeciesSheet from "@/components/species/SpeciesSheet.vue";

const detailRef = ref<InstanceType<typeof SpeciesDetail> | null>(null);

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "species-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));
const isSrd = useIsSrdSpecies(id);
// An srd slug row has no owned editor — ignore a stray ?edit=true rather than
// rendering the edit form against a row the user can't save.
const isEditing = computed(() => route.query.edit === "true" && !isSrd.value);

const { data: species, isLoading } = useSpecies(id);
const loading = computed(() => !isNew.value && isLoading.value);

const { mutateAsync: cloneSrd } = useCloneSrdSpecies();
const cloning = ref(false);

async function onClone() {
  if (!species.value) return;
  cloning.value = true;
  try {
    const clone = await cloneSrd(species.value);
    router.replace(`/species/${clone.id}?edit=true`);
  } finally {
    cloning.value = false;
  }
}

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
