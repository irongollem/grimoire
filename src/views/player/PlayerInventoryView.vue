<template>
  <div class="space-y-6 pb-8">
    <PageHeader flush title="Inventory" description="What you carry, and what the party shares." />
    <CharacterInventory :member-id="memberId" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import CharacterInventory from "@/components/inventory/CharacterInventory.vue";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";

// The DM reaches another character's pack from the Inventory tab on /party/:id, not here.
const auth = useAuthStore();
const appUi = useAppUiStore();
const memberId = computed(() =>
  appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
);
</script>
