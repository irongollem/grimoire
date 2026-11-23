<template>
  <QuestCanonBlock v-if="isRealDm" :quest-id="questId" :campaign-id="campaignId" />
</template>

<script setup lang="ts">
/**
 * "The canon behind this quest" (#1255 item 12), for the DM only. The canon tables are DM-only reads, so in the player
 * lens, or a DM's preview of the player portal, the block is not mounted and none of its reads run: the gate is here and
 * the reads are in the block it guards.
 */
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import QuestCanonBlock from "./QuestCanonBlock.vue";

defineProps<{ questId: string; campaignId: string }>();

const auth = useAuthStore();
const appUi = useAppUiStore();
const isRealDm = computed(() => auth.isDM && !appUi.dmPreviewMode);
</script>
