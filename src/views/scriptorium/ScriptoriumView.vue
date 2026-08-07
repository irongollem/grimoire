<template>
  <ListPageLayout title="Scriptorium" description="Craft spell scrolls, stat blocks, and campaign documents">
    <template #title-suffix>
      <ManualHelpLink page="scriptorium-document-publisher" />
    </template>

    <template #actions>
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
import { IconAdd } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ScriptoriumDocumentList from "@/components/scriptorium/ScriptoriumDocumentList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const { canCreate } = useQuota("scriptorium_documents");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/scriptorium/new");
}
</script>
