<template>
  <ListPageLayout title="Campaign Notes" description="Session logs, lore, and secrets of the realm">
    <template #title-suffix>
      <ManualHelpLink page="campaign-notes" />
    </template>

    <template #actions>
      <ListActionButton
        variant="primary"
        :icon="IconAdd"
        label="New Note"
        @click="handleNew"
      />
      <ListLayoutToggle v-model="layout" />
    </template>

    <NotesList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="notes" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { IconAdd } from '@/lib/icons';
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListLayoutToggle from "@/components/common/list/ListLayoutToggle.vue";
import { useListLayout } from "@/composables/useListLayout";
import NotesList from "@/components/notes/NotesList.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";

const router = useRouter();
const { canCreate } = useQuota("notes");
const showPaywall = ref(false);
const layout = useListLayout("notes", "grid");

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/notes/new");
}
</script>
