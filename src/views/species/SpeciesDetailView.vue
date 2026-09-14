<template>
  <PageHeader :title="pageTitle" :description="pageDescription">
    <template v-if="isNew || isEditing" #actions>
      <AppButton
        v-if="!isNew"
        variant="subtle"
        size="md"
        label="Cancel"
        @click="onCancel"
      />
      <DetailActions :detail-ref="detailRef" :exists="!!species" />
    </template>
    <template v-else-if="isShared && species" #actions>
      <PageHeaderAction
        variant="primary"
        :disabled="cloning"
        :label="cloning ? 'Copying…' : 'Clone to customize'"
        :icon="IconCopy"
        @click="onClone"
      />
    </template>
    <template v-else-if="species" #actions>
      <PageHeaderAction label="Copy to campaign…" :icon="IconCopy" @click="copyOpen = true" />
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <SpeciesDetail v-else-if="isNew || isEditing" ref="detailRef" :species="species ?? null" />
    <SpeciesSheet v-else-if="species" :species="species" :is-shared="isShared" />
  </PageHeader>

  <CopyToCampaignDialog
    v-if="species"
    :open="copyOpen"
    table="species"
    :ids="[species.id]"
    :source-campaign-id="species.campaign_id"
    label="species"
    label-plural="species"
    @close="copyOpen = false"
    @copied="onCopied"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconCopy } from '@/lib/icons';
import { useSpecies, useIsLibrarySpecies, useCloneLibrarySpecies } from "@/composables/rules/useSpecies";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DetailActions from "@/components/common/DetailActions.vue";
import SpeciesDetail from "@/components/species/SpeciesDetail.vue";
import SpeciesSheet from "@/components/species/SpeciesSheet.vue";
import CopyToCampaignDialog from "@/components/common/CopyToCampaignDialog.vue";
import { useToast } from "@/composables/useToast";

const detailRef = ref<InstanceType<typeof SpeciesDetail> | null>(null);

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "species-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));
const isShared = useIsLibrarySpecies(id);
// An srd slug row has no owned editor — ignore a stray ?edit=true rather than
// rendering the edit form against a row the user can't save.
const isEditing = computed(() => route.query.edit === "true" && !isShared.value);

const { data: species, isLoading } = useSpecies(id);
const loading = computed(() => !isNew.value && isLoading.value);

const { mutateAsync: cloneLibrary } = useCloneLibrarySpecies();
const cloning = ref(false);

async function onClone() {
  if (!species.value) return;
  cloning.value = true;
  try {
    const clone = await cloneLibrary(species.value);
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

// ── Copy to campaign (#598) ─────────────────────────────────────────────────
//
// Unlike Clone to customize above, this deliberately does NOT navigate on
// success — a Post-Mutation Navigation exception (see CLAUDE.md). The copy
// lands in another campaign, which neither this page nor the species list can
// show, so the toast naming the destination is the only confirmation there
// can be; navigating away from the record the DM is still looking at would be
// strictly worse.
const toast = useToast();
const copyOpen = ref(false);

function onCopied({ targetName }: { copied: number; targetName: string }) {
  toast.success(`Copied "${species.value?.name ?? "species"}" to ${targetName}.`);
  copyOpen.value = false;
}
</script>
