<template>
  <ListPageLayout title="Scriptorium" description="Handouts for your players, and books for your table">
    <template #title-suffix>
      <ManualHelpLink page="scriptorium-document-publisher" />
    </template>

    <!-- Writing needs a larger screen (#915 story 7): the phone list is a
         reader, so it has no write actions, only the layout toggle. -->
    <template #actions>
      <ListActionButton
        v-if="canWrite && campaign.isAiEnabled"
        variant="outline"
        :icon="IconGenerate"
        label="Draft with AI"
        @click="handleDraft"
      />
      <ListActionButton
        v-if="canWrite"
        variant="outline"
        :icon="IconNavScriptorium"
        label="New book"
        @click="handleNewBook"
      />
      <NewHandoutPicker v-if="canWrite" />
      <ListLayoutToggle v-model="layout" />
    </template>

    <ScriptoriumDocumentList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { IconGenerate, IconNavScriptorium } from '@/lib/icons';
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListLayoutToggle from "@/components/common/list/ListLayoutToggle.vue";
import { useListLayout } from "@/composables/useListLayout";
import NewHandoutPicker from "@/components/scriptorium/NewHandoutPicker.vue";
import ScriptoriumDocumentList from "@/components/scriptorium/ScriptoriumDocumentList.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { useCampaignStore } from "@/stores/campaign";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useAbove } from "@/composables/useBreakpoint";

const router = useRouter();
const { canCreate } = useQuota("scriptorium_documents");
const showPaywall = ref(false);
const canWrite = useAbove("md");
const layout = useListLayout("scriptorium", "grid");
const campaign = useCampaignStore();

// The dialog checks the quota again before it spends anything, so no gate here.
function handleDraft() {
  useGeneratorUiStore().scriptoriumDraftOpen = true;
}

// A book starts from the template gallery at /scriptorium/new, which creates it and opens it.
function handleNewBook() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/scriptorium/new");
}
</script>
