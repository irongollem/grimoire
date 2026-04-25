<template>
  <ListPageLayout title="Campaign Notes" description="Session logs, lore, and secrets of the realm">
    <template #actions>
      <ListActionButton
        :icon="Plus"
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
import { Plus } from "lucide-vue-next";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
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
