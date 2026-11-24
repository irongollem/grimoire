<template>
  <FactionForcesBlock v-if="isRealDm" :faction-id="factionId" />
</template>

<script setup lang="ts">
/**
 * "What it is moving" on a faction's page (#1255 item 12), for the DM only. Forces are canon, and the canon tables are
 * DM-only reads: in the player lens, or a DM's preview of the player portal, nothing is mounted and no read runs. The
 * gate is here and the reads are in the block it guards.
 */
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import FactionForcesBlock from "./FactionForcesBlock.vue";

defineProps<{ factionId: string }>();

const auth = useAuthStore();
const appUi = useAppUiStore();
const isRealDm = computed(() => auth.isDM && !appUi.dmPreviewMode);
</script>
