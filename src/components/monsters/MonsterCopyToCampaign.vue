<template>
  <!--
    "Copy to campaign…" for a monster the caller can read but not edit (#590,
    co-DM): the copy inserts a new row under the caller, which is allowed, and
    it is the one write a read-only sheet keeps. The editor reaches the same
    flow through its send menu; this is the read surfaces' way in, so the slot
    holds whatever trigger the host draws (a header button, a menu row).
  -->
  <slot :open="openCopy" />

  <CopyToCampaignDialog
    :open="copyOpen"
    table="monsters"
    :ids="copyIds"
    label="monster"
    @close="copyOpen = false"
    @copied="onCopied"
    @quota-exceeded="onQuotaExceeded"
  />
  <PaywallModal v-model="showPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import CopyToCampaignDialog from "@/components/common/overlays/CopyToCampaignDialog.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useCopyEntityToCampaign } from "@/composables/campaign/useCopyEntityToCampaign";
import type { Monster } from "@/types/monster.types";

const { monster } = defineProps<{ monster: Monster }>();

const showPaywall = ref(false);
const { copyOpen, copyIds, openCopy, onCopied, onQuotaExceeded } = useCopyEntityToCampaign({
  entity: () => monster,
  noun: "monster",
  onQuotaExceeded: () => {
    showPaywall.value = true;
  },
});
</script>
