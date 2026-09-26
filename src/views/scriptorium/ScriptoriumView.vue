<template>
  <ListPageLayout title="Scriptorium" description="Craft spell scrolls, stat blocks, and campaign documents">
    <template #title-suffix>
      <ManualHelpLink page="scriptorium-document-publisher" />
    </template>

    <template #actions>
      <!-- Writing needs a larger screen (#915 story 7) — the phone list stays
           a reader, so there's nothing useful for this action to open here. -->
      <ListActionButton
        v-if="canWrite"
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
import { IconAdd } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ScriptoriumDocumentList from "@/components/scriptorium/ScriptoriumDocumentList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";
import { useAbove } from "@/composables/useBreakpoint";

const router = useRouter();
const { canCreate } = useQuota("scriptorium_documents");
const showPaywall = ref(false);
const canWrite = useAbove("md");

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/scriptorium/new");
}
</script>
