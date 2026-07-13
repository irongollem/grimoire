<template>
  <ListPageLayout title="Campaign Notes" description="Session logs, lore, and secrets of the realm">
    <template #title-suffix>
      <ManualHelpLink page="campaign-notes" />
    </template>

    <template #actions>
      <ListActionButton
        :icon="IconAdd"
        label="New Note"
        variant="primary"
        @click="handleNew"
      />
    </template>

    <NotesList />
  </ListPageLayout>

  <PaywallModal v-model="showPaywall" resource="notes" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { IconAdd } from '@/lib/icons';
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import NotesList from "@/components/notes/NotesList.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const { canCreate } = useQuota("notes");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/notes/new");
}
</script>
