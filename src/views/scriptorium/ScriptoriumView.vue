<template>
  <ListPageLayout title="Scriptorium" description="Craft spell scrolls, stat blocks, and campaign documents">
    <template #title-suffix>
      <ManualHelpLink page="scriptorium-document-publisher" />
    </template>

    <!-- Writing needs a larger screen (#915 story 7): the phone list is a
         reader, so it has no actions at all, and no empty action row. -->
    <template v-if="canWrite" #actions>
      <ListActionButton
        v-if="campaign.isAiEnabled"
        variant="outline"
        :icon="IconGenerate"
        label="Draft with AI"
        @click="handleDraft"
      />
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Document"
        @click="handleNew"
      />
    </template>

    <ScriptoriumDocumentList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { IconAdd, IconGenerate } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ScriptoriumDocumentList from "@/components/scriptorium/ScriptoriumDocumentList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useAbove } from "@/composables/useBreakpoint";

const router = useRouter();
const { canCreate } = useQuota("scriptorium_documents");
const showPaywall = ref(false);
const canWrite = useAbove("md");
const campaign = useCampaignStore();

// The dialog checks the quota again before it spends anything, so no gate here.
function handleDraft() {
  useUiStore().scriptoriumDraftOpen = true;
}

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/scriptorium/new");
}
</script>
